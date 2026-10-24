const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

// Helper: Calculate distance between two coordinates in km
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper: Normalize slot time to exact hourly boundary
const normalizeSlotTime = (slotTime) => {
  if (!slotTime) return null;
  const d = new Date(slotTime);
  if (isNaN(d.getTime())) return null;
  d.setMinutes(0, 0, 0);
  return d;
};

// Helper: Centralized cleanup of expired locks and session completion lifecycle
const updateBookingLifecycle = async (stationId = null) => {
  const now = new Date();
  const query = stationId ? { stationId } : {};

  // 1. Mark expired holds
  await Booking.updateMany(
    {
      ...query,
      status: 'locked',
      lockedUntil: { $lte: now },
      active: true
    },
    {
      $set: { status: 'expired', active: false }
    }
  );

  // 2. Mark completed sessions (session ended: slotTime + 60 mins <= now)
  const pastSessionCutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const endedBookings = await Booking.find({
    ...query,
    status: { $in: ['confirmed', 'active'] },
    slotTime: { $lte: pastSessionCutoff },
    active: true
  });

  for (const b of endedBookings) {
    b.status = 'completed';
    b.active = false;
    await b.save();

    // Safely free the charger if no other active booking on that charger
    try {
      const station = await Station.findById(b.stationId);
      if (station) {
        const charger = station.chargers.find(c => c.id === b.chargerId);
        if (charger && charger.status === 'occupied') {
          // Check if there is another current ongoing booking
          const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
          const otherCurrentBooking = await Booking.findOne({
            stationId: b.stationId,
            chargerId: b.chargerId,
            slotTime: currentHour,
            status: { $in: ['confirmed', 'active'] },
            active: true,
            _id: { $ne: b._id }
          });
          if (!otherCurrentBooking) {
            charger.status = 'free';
            await station.save();
          }
        }
      }
    } catch (_) {}
  }

  // 3. Promote confirmed bookings to active if current slot is ongoing
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  await Booking.updateMany(
    {
      ...query,
      status: 'confirmed',
      slotTime: currentHour,
      active: true
    },
    {
      $set: { status: 'active' }
    }
  );
};

// Smart Redirection helper: Find alternative station nearby
const findAlternativeStation = async (originalStation, slotTime, connectorType) => {
  const targetSlot = normalizeSlotTime(slotTime);
  if (!targetSlot) return null;

  const allStations = await Station.find({ _id: { $ne: originalStation._id } });
  const alternatives = [];
  const origLat = originalStation.location.coordinates[1];
  const origLng = originalStation.location.coordinates[0];
  const now = new Date();

  for (const station of allStations) {
    if (connectorType && !station.connectorTypes.includes(connectorType)) {
      continue;
    }

    const dist = getDistance(origLat, origLng, station.location.coordinates[1], station.location.coordinates[0]);
    if (dist > 50) continue; // limit to 50km radius
    
    // Check active non-expired bookings for this station at slotTime
    const activeBookings = await Booking.find({
      stationId: station._id,
      slotTime: targetSlot,
      active: true,
      $or: [
        { status: { $in: ['confirmed', 'active', 'payment_pending'] } },
        { status: 'locked', lockedUntil: { $gt: now } }
      ]
    });

    const bookedChargerIds = new Set(activeBookings.map(b => b.chargerId));
    const freeChargers = station.chargers.filter(c => c.status !== 'maintenance' && !bookedChargerIds.has(c.id));

    if (freeChargers.length > 0) {
      alternatives.push({
        station,
        distance: dist,
        freeChargersCount: freeChargers.length
      });
    }
  }

  alternatives.sort((a, b) => a.distance - b.distance);
  return alternatives.length > 0 ? alternatives[0] : null;
};

// 1. POST /api/bookings/lock - Create an authoritative 5-minute hold on a charger slot
router.post('/lock', authMiddleware, async (req, res) => {
  try {
    const { stationId, slotTime, chargerId, connectorType, energyKwh = 15 } = req.body;
    const userEmail = req.user.email;

    if (!stationId || !slotTime) {
      return res.status(400).json({ success: false, error: 'StationId and slotTime are required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(stationId)) {
      return res.status(400).json({ success: false, error: 'Invalid station ID format.' });
    }

    const targetSlot = normalizeSlotTime(slotTime);
    if (!targetSlot) {
      return res.status(400).json({ success: false, error: 'Invalid slotTime date format.' });
    }

    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    // Reject past slots (current hour is allowed, anything before is rejected)
    if (targetSlot.getTime() < currentHour.getTime()) {
      return res.status(400).json({ success: false, error: 'Cannot book a past time slot. Please choose an upcoming slot.' });
    }

    // Run central lifecycle check
    await updateBookingLifecycle(stationId);

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found.' });
    }

    // Find active non-expired bookings for the normalized slot
    const activeBookings = await Booking.find({
      stationId,
      slotTime: targetSlot,
      active: true,
      $or: [
        { status: { $in: ['confirmed', 'active', 'payment_pending'] } },
        { status: 'locked', lockedUntil: { $gt: now } }
      ]
    });

    const bookedChargers = new Set(activeBookings.map(b => b.chargerId));

    let targetCharger = null;
    if (chargerId) {
      const charger = station.chargers.find(c => c.id === chargerId);
      if (!charger) {
        return res.status(404).json({ success: false, error: `Charger ${chargerId} does not exist at this station.` });
      }
      if (charger.status === 'maintenance') {
        return res.status(400).json({ success: false, error: `Charger ${chargerId} is currently under maintenance and cannot be reserved.` });
      }
      if (bookedChargers.has(chargerId)) {
        const alternative = await findAlternativeStation(station, targetSlot, connectorType);
        return res.status(409).json({
          success: false,
          error: `Charger ${chargerId} is already reserved for this slot.`,
          fullyBooked: true,
          alternative: alternative ? {
            _id: alternative.station._id,
            name: alternative.station.name,
            distance: Number(alternative.distance.toFixed(1)),
            freeChargers: alternative.freeChargersCount,
            pricingPerKwh: alternative.station.pricingPerKwh,
            chargingSpeedKw: alternative.station.chargingSpeedKw,
            location: alternative.station.location
          } : null
        });
      }
      targetCharger = charger;
    } else {
      targetCharger = station.chargers.find(c => c.status !== 'maintenance' && !bookedChargers.has(c.id));
      if (!targetCharger) {
        const alternative = await findAlternativeStation(station, targetSlot, connectorType);
        return res.status(409).json({
          success: false,
          error: 'Station is fully booked for this time slot.',
          fullyBooked: true,
          alternative: alternative ? {
            _id: alternative.station._id,
            name: alternative.station.name,
            distance: Number(alternative.distance.toFixed(1)),
            freeChargers: alternative.freeChargersCount,
            pricingPerKwh: alternative.station.pricingPerKwh,
            chargingSpeedKw: alternative.station.chargingSpeedKw,
            location: alternative.station.location
          } : null
        });
      }
    }

    // 5-minute server-authoritative hold
    const HOLD_DURATION_MS = 5 * 60 * 1000;
    const lockedUntil = new Date(Date.now() + HOLD_DURATION_MS);

    // Calculate server price snapshot
    const validEnergy = Math.max(1, Number(energyKwh) || 15);
    const baseAmount = Math.round(validEnergy * station.pricingPerKwh);
    const gstAmount = Math.round(baseAmount * 0.18); // 18% GST standard
    const totalAmount = baseAmount + gstAmount;
    const amountInPaise = totalAmount * 100;

    const bookingRef = `VS-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const checkInCode = `VP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const booking = new Booking({
      bookingReference: bookingRef,
      stationId,
      chargerId: targetCharger.id,
      connectorType: connectorType || station.connectorTypes[0],
      slotTime: targetSlot,
      status: 'locked',
      lockedUntil,
      energyKwh: validEnergy,
      unitPricePerKwh: station.pricingPerKwh,
      amountDue: totalAmount,
      amountPaid: 0,
      amountInPaise,
      currency: 'INR',
      paymentStatus: 'unpaid',
      taxBreakdown: {
        baseAmount,
        gstAmount,
        totalAmount
      },
      checkInCode,
      userEmail,
      active: true
    });

    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Charger slot held successfully for 5 minutes.',
      bookingId: booking._id,
      bookingReference: booking.bookingReference,
      chargerId: booking.chargerId,
      lockedUntil: booking.lockedUntil,
      slotTime: booking.slotTime,
      pricing: {
        baseAmount,
        gstAmount,
        totalAmount,
        amountInPaise
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'This slot was just reserved by another user. Please choose another slot.',
        concurrencyConflict: true
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST /api/bookings/confirm - Safe confirmation endpoint
router.post('/confirm', authMiddleware, async (req, res) => {
  try {
    const { bookingId, paymentIntentId, energyKwh } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, error: 'bookingId is required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, error: 'Invalid booking reservation ID format.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking reservation not found.' });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Forbidden: This booking does not belong to you.' });
    }

    // If hold expired
    if (booking.status === 'locked' && booking.lockedUntil < new Date()) {
      booking.status = 'expired';
      booking.active = false;
      await booking.save();
      return res.status(400).json({ success: false, error: 'Reservation lock has expired. Please reserve again.' });
    }

    const isDevMock = process.env.NODE_ENV !== 'production' && (process.env.PAYMENT_MODE === 'mock' || !process.env.RAZORPAY_KEY_ID);
    // Direct confirmation without verified payment is strictly forbidden in production (Requirement 5)
    if (!isDevMock && booking.paymentStatus !== 'paid' && !booking.paymentSignature) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification is required before confirming a booking. Please complete verified checkout.'
      });
    }

    if (booking.status === 'confirmed' || booking.status === 'active') {
      return res.json({ success: true, message: 'Booking is already confirmed.', booking });
    }

    const station = await Station.findById(booking.stationId);
    const validEnergy = Math.max(1, Number(energyKwh || booking.energyKwh || 15));
    const baseAmount = Math.round(validEnergy * (station ? station.pricingPerKwh : 15));
    const gstAmount = Math.round(baseAmount * 0.18);
    const totalAmount = baseAmount + gstAmount;

    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    if (paymentIntentId) booking.paymentIntentId = paymentIntentId;
    booking.amountPaid = baseAmount;
    booking.amountDue = baseAmount;
    booking.amountInPaise = totalAmount * 100;
    booking.taxBreakdown = {
      baseAmount,
      gstAmount,
      totalAmount
    };
    booking.lockedUntil = undefined;
    await booking.save();

    res.json({ success: true, message: 'Booking confirmed successfully.', booking });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET /api/bookings/my-bookings - List user booking history
router.get('/my-bookings', authMiddleware, async (req, res) => {
  try {
    const email = req.user && req.user.email;
    if (!email) {
      return res.status(400).json({ success: false, error: 'User email not found in authentication token.' });
    }

    // Run central lifecycle check
    await updateBookingLifecycle();

    const bookings = await Booking.find({ userEmail: email.toLowerCase() })
      .populate('stationId', 'name location pricingPerKwh chargingSpeedKw connectorTypes')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. POST /api/bookings/release - Release lock manually when cancelled
router.post('/release', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId is required.' });

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.' });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Forbidden: This booking does not belong to you.' });
    }

    if (booking.status === 'locked') {
      booking.status = 'cancelled';
      booking.active = false;
      await booking.save();
      return res.json({ success: true, message: 'Lock released successfully.' });
    }
    res.status(400).json({ success: false, error: `Booking cannot be released. Current status: ${booking.status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. POST /api/bookings/cancel - Cancel a confirmed or locked booking
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId is required.' });

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.' });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Forbidden: This booking does not belong to you.' });
    }

    if (!['locked', 'confirmed', 'payment_pending', 'active'].includes(booking.status)) {
      return res.status(400).json({ success: false, error: `Cannot cancel a booking with status: ${booking.status}` });
    }

    booking.status = 'cancelled';
    booking.active = false;
    await booking.save();

    // Check if charger should be freed (only if cancellation is for an ongoing session)
    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    const isCurrentSession = booking.slotTime && booking.slotTime.getTime() === currentHour.getTime();

    if (isCurrentSession) {
      try {
        const station = await Station.findById(booking.stationId);
        if (station) {
          const charger = station.chargers.find(c => c.id === booking.chargerId);
          if (charger && charger.status !== 'maintenance') {
            // Ensure no other active session on that charger
            const otherActive = await Booking.findOne({
              stationId: booking.stationId,
              chargerId: booking.chargerId,
              slotTime: currentHour,
              status: { $in: ['confirmed', 'active'] },
              active: true,
              _id: { $ne: booking._id }
            });
            if (!otherActive) {
              charger.status = 'free';
              await station.save();
            }
          }
        }
      } catch (_) {}
    }

    res.json({ success: true, message: 'Booking cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. POST /api/bookings/check-in - Authorized Operator FastPass Check-in & validation
router.post('/check-in', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { checkInCode, bookingReference } = req.body;

    if (!checkInCode && !bookingReference) {
      return res.status(400).json({ success: false, error: 'checkInCode or bookingReference is required for check-in.' });
    }

    const query = {};
    if (checkInCode) query.checkInCode = String(checkInCode).trim().toUpperCase();
    if (bookingReference) query.bookingReference = String(bookingReference).trim().toUpperCase();

    const booking = await Booking.findOne(query).populate('stationId');
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Invalid check-in code or pass not found.' });
    }

    // Verify the station belongs to this operator
    if (booking.stationId && booking.stationId.operatorId && booking.stationId.operatorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: This pass belongs to a station owned by another operator.' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Check-in rejected: This booking was cancelled.' });
    }

    if (booking.status === 'expired') {
      return res.status(400).json({ success: false, error: 'Check-in rejected: This reservation lock expired.' });
    }

    if (booking.checkInStatus === 'checked_in') {
      return res.status(400).json({
        success: false,
        error: `Check-in rejected: Pass already used at ${booking.checkedInAt ? booking.checkedInAt.toLocaleTimeString() : 'earlier'}. Reusable passes are not permitted.`
      });
    }

    if (booking.status !== 'confirmed' && booking.status !== 'active') {
      return res.status(400).json({ success: false, error: `Check-in rejected: Booking is not confirmed (status: ${booking.status}).` });
    }

    // Mark checked in and completed
    booking.checkInStatus = 'checked_in';
    booking.checkedInAt = new Date();
    booking.status = 'completed';
    await booking.save();

    res.json({
      success: true,
      message: 'FastPass check-in verified successfully!',
      booking: {
        id: booking._id,
        reference: booking.bookingReference,
        stationName: booking.stationId?.name,
        chargerId: booking.chargerId,
        slotTime: booking.slotTime,
        driverEmail: booking.userEmail,
        energyKwh: booking.energyKwh,
        amountPaid: booking.amountPaid,
        checkedInAt: booking.checkedInAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
