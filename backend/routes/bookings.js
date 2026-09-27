const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const authMiddleware = require('../middleware/auth');

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

// Smart Redirection helper: Find the next best available station nearby
const findAlternativeStation = async (originalStation, slotTime) => {
  const targetSlot = new Date(slotTime);
  const allStations = await Station.find({ _id: { $ne: originalStation._id } });
  
  const alternatives = [];
  const origLat = originalStation.location.coordinates[1];
  const origLng = originalStation.location.coordinates[0];

  for (const station of allStations) {
    const dist = getDistance(origLat, origLng, station.location.coordinates[1], station.location.coordinates[0]);
    
    // Check bookings for this station at the slotTime
    const activeBookings = await Booking.find({
      stationId: station._id,
      slotTime: targetSlot,
      active: true
    });

    const bookedChargerIds = activeBookings.map(b => b.chargerId);
    const freeChargers = station.chargers.filter(c => c.status !== 'maintenance' && !bookedChargerIds.includes(c.id));

    if (freeChargers.length > 0) {
      alternatives.push({
        station,
        distance: dist,
        freeChargersCount: freeChargers.length
      });
    }
  }

  // Sort by distance (closest first)
  alternatives.sort((a, b) => a.distance - b.distance);
  return alternatives.length > 0 ? alternatives[0] : null;
};

// 1. POST /api/bookings/lock - Create a temporary 5-minute lock on a slot
router.post('/lock', authMiddleware, async (req, res) => {
  try {
    const { stationId, slotTime, chargerId } = req.body;
    const userEmail = req.user.email;

    if (!stationId || !slotTime) {
      return res.status(400).json({ error: 'StationId and slotTime are required.' });
    }

    const targetSlot = new Date(slotTime);
    const now = new Date();

    // 1. Release expired locks globally or for this slot to ensure accurate availability
    await Booking.updateMany(
      {
        stationId,
        slotTime: targetSlot,
        status: 'locked',
        lockedUntil: { $lte: now }
      },
      {
        $set: { status: 'cancelled', active: false }
      }
    );

    // 2. Load preferred station
    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({ error: 'Station not found.' });
    }

    // 3. Find active bookings for the slot
    const activeBookings = await Booking.find({
      stationId,
      slotTime: targetSlot,
      active: true
    });

    const bookedChargers = new Set(activeBookings.map(b => b.chargerId));
    
    // Determine which charger to lock
    let targetChargerId = chargerId;
    if (!targetChargerId) {
      // Auto-assign first available charger
      const availableCharger = station.chargers.find(c => c.status !== 'maintenance' && !bookedChargers.has(c.id));
      if (!availableCharger) {
        // Station is fully booked! Find alternative
        const alternative = await findAlternativeStation(station, slotTime);
        return res.status(409).json({
          error: 'Preferred station is fully booked for this slot.',
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
      targetChargerId = availableCharger.id;
    } else {
      // Check specific charger request
      if (bookedChargers.has(targetChargerId)) {
        const alternative = await findAlternativeStation(station, slotTime);
        return res.status(409).json({
          error: `Charger ${targetChargerId} is already booked for this slot.`,
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

    // 4. Create locked booking document
    const lockDuration = 5 * 60 * 1000; // 5 minutes
    const lockedUntil = new Date(Date.now() + lockDuration);

    const booking = new Booking({
      stationId,
      chargerId: targetChargerId,
      slotTime: targetSlot,
      status: 'locked',
      lockedUntil,
      userEmail,
      amountPaid: 0,
      active: true
    });

    // Save booking - unique index on (stationId, chargerId, slotTime, active) prevents double-booking
    await booking.save();

    res.status(201).json({
      message: 'Slot locked successfully.',
      bookingId: booking._id,
      chargerId: booking.chargerId,
      lockedUntil: booking.lockedUntil,
      slotTime: booking.slotTime
    });

  } catch (error) {
    // Handle unique constraint violation (duplicate key error code 11000)
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Slot was booked by another user in a concurrent request. Please try again.',
        concurrencyConflict: true
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// 2. POST /api/bookings/confirm - Confirm booking with server-calculated pricing and auth
router.post('/confirm', authMiddleware, async (req, res) => {
  try {
    const { bookingId, paymentIntentId, energyKwh } = req.body; // amountPaid removed from accepted input
    if (!bookingId || !paymentIntentId || !energyKwh) {
      return res.status(400).json({ error: 'bookingId, paymentIntentId, and energyKwh are required.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking/Lock record not found.' });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ error: 'This booking does not belong to you.' });
    }

    if (booking.status === 'locked' && booking.lockedUntil < new Date()) {
      booking.status = 'cancelled';
      booking.active = false;
      await booking.save();
      return res.status(400).json({ error: 'Reservation lock has expired. Please book again.' });
    }
    if (booking.status !== 'locked') {
      return res.status(400).json({ error: `Booking cannot be confirmed. Current status: ${booking.status}` });
    }

    const station = await Station.findById(booking.stationId);
    const serverAmount = Math.max(0, Math.round(Number(energyKwh) * station.pricingPerKwh));

    booking.status = 'confirmed';
    booking.paymentIntentId = paymentIntentId;
    booking.amountPaid = serverAmount;
    booking.lockedUntil = undefined;
    await booking.save();

    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    if (new Date(booking.slotTime).getTime() === currentHour.getTime()) {
      await Station.updateOne(
        { _id: booking.stationId, 'chargers.id': booking.chargerId },
        { $set: { 'chargers.$.status': 'occupied' } }
      );
    }

    res.json({ message: 'Booking confirmed successfully.', booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. GET /api/bookings/my-bookings - List user booking history (protected from IDOR)
router.get('/my-bookings', authMiddleware, async (req, res) => {
  try {
    const email = req.user && req.user.email;
    if (!email) {
      return res.status(400).json({ error: 'User email not found in authentication token.' });
    }

    // Check and expire active locks before returning history
    const now = new Date();
    await Booking.updateMany(
      {
        userEmail: email,
        status: 'locked',
        lockedUntil: { $lte: now }
      },
      {
        $set: { status: 'cancelled', active: false }
      }
    );

    const bookings = await Booking.find({ userEmail: email })
      .populate('stationId', 'name location pricingPerKwh chargingSpeedKw')
      .sort({ slotTime: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. POST /api/bookings/release - Release lock manually (if payment cancelled)
router.post('/release', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ error: 'This booking does not belong to you.' });
    }

    if (booking.status === 'locked') {
      booking.status = 'cancelled';
      booking.active = false;
      await booking.save();
      return res.json({ message: 'Lock released successfully.' });
    }
    res.status(400).json({ error: 'Booking is not in locked state.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. POST /api/bookings/cancel - Cancel a confirmed or locked booking
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ error: 'This booking does not belong to you.' });
    }
    if (!['locked', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a booking with status: ${booking.status}` });
    }

    booking.status = 'cancelled';
    booking.active = false;
    await booking.save();

    // Free the charger if it was marked occupied for this booking
    await Station.updateOne(
      { _id: booking.stationId, 'chargers.id': booking.chargerId },
      { $set: { 'chargers.$.status': 'free' } }
    );

    res.json({ message: 'Booking cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
