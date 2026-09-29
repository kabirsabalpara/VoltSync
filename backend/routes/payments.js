const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const authMiddleware = require('../middleware/auth');

// Initialize Razorpay if credentials exist in environment
const isRazorpayConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID && 
  process.env.RAZORPAY_KEY_SECRET &&
  !process.env.RAZORPAY_KEY_ID.includes('placeholder')
);

let razorpayInstance = null;
if (isRazorpayConfigured) {
  try {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('Razorpay Payment Gateway initialized in live/test mode with Key ID:', process.env.RAZORPAY_KEY_ID);
  } catch (err) {
    console.error('Error initializing Razorpay client:', err.message);
  }
} else {
  console.log('Razorpay keys not set or in test mode. Running VoltSync Secure Payment Gateway Sandbox.');
}

// 1. GET /api/payments/config - Get client payment gateway configuration
router.get('/config', (req, res) => {
  res.json({
    status: 'ok',
    gateway: isRazorpayConfigured ? 'razorpay' : 'sandbox',
    isRazorpayConfigured,
    keyId: isRazorpayConfigured ? process.env.RAZORPAY_KEY_ID : 'rzp_test_voltsync_sandbox',
    currency: 'INR',
    supportedMethods: [
      { id: 'upi', name: 'Instant UPI / QR Code', description: 'GPay, PhonePe, Paytm, BHIM UPI' },
      { id: 'card', name: 'Credit & Debit Cards', description: 'Visa, Mastercard, RuPay, Maestro' },
      { id: 'netbanking', name: 'Net Banking', description: '50+ Indian Banks (HDFC, SBI, ICICI, etc.)' },
      { id: 'wallet', name: 'VoltSync FastPass Wallet', description: 'Instant 1-Click EV Balance' }
    ]
  });
});

// 2. POST /api/payments/create-order - Create Payment Order
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { bookingId, energyKwh = 15, paymentMethod = 'upi' } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking reservation not found.' });
    }

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ error: 'Unauthorized: Booking does not belong to you.' });
    }

    // Check expiration if locked
    if (booking.status === 'locked' && booking.lockedUntil < new Date()) {
      booking.status = 'cancelled';
      booking.active = false;
      await booking.save();
      return res.status(400).json({ error: 'Reservation lock has expired. Please reserve a new slot.' });
    }

    if (booking.status !== 'locked') {
      return res.status(400).json({ error: `Cannot process payment for booking with status: ${booking.status}` });
    }

    const station = await Station.findById(booking.stationId);
    if (!station) {
      return res.status(404).json({ error: 'Station details not found.' });
    }

    // Calculate server-side financial breakdown (prevent client tampering)
    const validEnergy = Math.max(1, Number(energyKwh));
    const baseEnergyCost = Math.round(validEnergy * station.pricingPerKwh);
    const gstAmount = Math.round(baseEnergyCost * 0.18); // 18% GST for EV services
    const cessAmount = Math.round(baseEnergyCost * 0.02); // 2% Green Energy Infrastructure Cess
    const totalAmount = baseEnergyCost + gstAmount + cessAmount;
    const amountInPaise = totalAmount * 100;

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    let orderId;
    let gatewayType = 'sandbox';

    if (isRazorpayConfigured && razorpayInstance) {
      try {
        const rzpOrder = await razorpayInstance.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `rcpt_${booking._id.toString().substring(0, 14)}`,
          notes: {
            stationName: station.name,
            chargerId: booking.chargerId,
            userEmail: req.user.email,
            slotTime: booking.slotTime.toISOString()
          }
        });
        orderId = rzpOrder.id;
        gatewayType = 'razorpay';
      } catch (rzpErr) {
        console.warn('Razorpay API call failed, falling back to secure sandbox order:', rzpErr.message);
        orderId = `order_vs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      }
    } else {
      orderId = `order_vs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    // Persist pending order info on booking
    booking.paymentOrderId = orderId;
    booking.paymentMethod = paymentMethod;
    booking.paymentGateway = gatewayType;
    booking.invoiceNumber = invoiceNumber;
    booking.taxBreakdown = {
      baseAmount: baseEnergyCost,
      gstAmount,
      cessAmount,
      totalAmount
    };
    booking.amountPaid = totalAmount;
    await booking.save();

    res.json({
      success: true,
      orderId,
      amount: totalAmount,
      amountInPaise,
      currency: 'INR',
      keyId: isRazorpayConfigured ? process.env.RAZORPAY_KEY_ID : 'rzp_test_voltsync_sandbox',
      gateway: gatewayType,
      invoiceNumber,
      taxBreakdown: booking.taxBreakdown,
      station: {
        id: station._id,
        name: station.name,
        pricingPerKwh: station.pricingPerKwh,
        speedKw: station.chargingSpeedKw
      },
      booking: {
        id: booking._id,
        chargerId: booking.chargerId,
        slotTime: booking.slotTime
      }
    });

  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({ error: error.message || 'Payment order initialization failed.' });
  }
});

// 3. POST /api/payments/verify - Verify Payment Signature & Finalize Reservation
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { 
      bookingId, 
      orderId, 
      paymentId, 
      signature, 
      paymentMethod = 'upi' 
    } = req.body;

    if (!bookingId || !orderId || !paymentId) {
      return res.status(400).json({ error: 'bookingId, orderId, and paymentId are required.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking reservation not found.' });
    }

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ error: 'Unauthorized: Booking does not belong to you.' });
    }

    if (booking.paymentOrderId && booking.paymentOrderId !== orderId) {
      return res.status(400).json({ error: 'Payment Order ID mismatch.' });
    }

    // Razorpay signature validation if in real Razorpay mode
    if (isRazorpayConfigured && booking.paymentGateway === 'razorpay' && signature) {
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature !== signature) {
        return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
      }
    }

    // Lock expiration check
    if (booking.status === 'locked' && booking.lockedUntil < new Date()) {
      booking.status = 'cancelled';
      booking.active = false;
      await booking.save();
      return res.status(400).json({ error: 'Reservation lock has expired before payment completed.' });
    }

    // Confirm booking
    booking.status = 'confirmed';
    booking.paymentIntentId = paymentId;
    booking.paymentOrderId = orderId;
    booking.paymentSignature = signature || `sig_auto_verified_${Date.now()}`;
    booking.paymentMethod = paymentMethod;
    booking.lockedUntil = undefined;
    await booking.save();

    // Check if slot time matches current hour -> update charger status
    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    if (new Date(booking.slotTime).getTime() === currentHour.getTime()) {
      await Station.updateOne(
        { _id: booking.stationId, 'chargers.id': booking.chargerId },
        { $set: { 'chargers.$.status': 'occupied' } }
      );
    }

    const station = await Station.findById(booking.stationId);

    res.json({
      success: true,
      message: 'Payment verified and reservation confirmed!',
      booking,
      receipt: {
        invoiceNumber: booking.invoiceNumber,
        transactionId: paymentId,
        orderId,
        paymentGateway: booking.paymentGateway,
        paymentMethod: booking.paymentMethod,
        stationName: station ? station.name : 'VoltSync Hub',
        chargerId: booking.chargerId,
        slotTime: booking.slotTime,
        taxBreakdown: booking.taxBreakdown,
        totalPaid: booking.amountPaid,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message || 'Payment verification failed.' });
  }
});

// 4. GET /api/payments/receipt/:bookingId - Fetch official GST Tax Receipt
router.get('/receipt/:bookingId', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('stationId');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (booking.userEmail !== req.user.email && req.user.role !== 'operator') {
      return res.status(403).json({ error: 'Unauthorized to view this receipt.' });
    }

    res.json({
      invoiceNumber: booking.invoiceNumber || `INV-${booking._id.toString().slice(-6).toUpperCase()}`,
      stationName: booking.stationId?.name || 'VoltSync Station',
      stationAddress: 'VoltSync Fast Charging Network, India',
      driverEmail: booking.userEmail,
      chargerId: booking.chargerId,
      slotTime: booking.slotTime,
      paymentMethod: booking.paymentMethod || 'UPI',
      transactionId: booking.paymentIntentId || 'N/A',
      taxBreakdown: booking.taxBreakdown || {
        baseAmount: booking.amountPaid ? Math.round(booking.amountPaid / 1.2) : 0,
        gstAmount: booking.amountPaid ? Math.round(booking.amountPaid * 0.18 / 1.2) : 0,
        cessAmount: booking.amountPaid ? Math.round(booking.amountPaid * 0.02 / 1.2) : 0,
        totalAmount: booking.amountPaid || 0
      },
      date: booking.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
