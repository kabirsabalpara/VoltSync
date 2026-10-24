const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../config/jwt');

// Check if valid Razorpay API credentials are configured in environment
const isRazorpayConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID && 
  process.env.RAZORPAY_KEY_SECRET &&
  !process.env.RAZORPAY_KEY_ID.includes('placeholder') &&
  process.env.RAZORPAY_KEY_ID.startsWith('rzp_')
);

// Controlled development mock mode (explicitly permitted only in development)
const isDevMockAllowed = process.env.NODE_ENV !== 'production';

let razorpayInstance = null;
if (isRazorpayConfigured) {
  try {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('Razorpay Gateway initialized with Key ID:', process.env.RAZORPAY_KEY_ID);
  } catch (err) {
    console.error('Error initializing Razorpay client:', err.message);
  }
} else if (isDevMockAllowed) {
  console.log('Razorpay keys not configured. Running VoltSync Controlled Development Mock Mode.');
} else {
  console.warn('WARNING: Running in production without configured Razorpay keys. Real payments required.');
}

// 1. GET /api/payments/config - Get payment gateway capabilities
router.get('/config', (req, res) => {
  const isMock = !isRazorpayConfigured && isDevMockAllowed;
  res.json({
    success: true,
    status: 'ok',
    gateway: isRazorpayConfigured ? 'razorpay' : (isMock ? 'mock' : 'disabled'),
    isRazorpayConfigured,
    isMockMode: isMock,
    keyId: isRazorpayConfigured ? process.env.RAZORPAY_KEY_ID : (isMock ? 'rzp_test_voltsync_mock' : null),
    currency: 'INR',
    supportedMethods: [
      { id: 'upi', name: 'Instant UPI / QR Code', description: 'GPay, PhonePe, Paytm, BHIM UPI' },
      { id: 'card', name: 'Credit & Debit Cards', description: 'Visa, Mastercard, RuPay' },
      { id: 'netbanking', name: 'Net Banking', description: 'All Major Indian Banks' },
      { id: 'wallet', name: 'VoltSync FastPass Wallet', description: '1-Click EV Balance' }
    ]
  });
});

// 2. POST /api/payments/create-order - Create Server Payment Order tied to authenticated booking
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { bookingId, energyKwh = 15, paymentMethod = 'upi' } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, error: 'bookingId is required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking reservation not found.' });
    }

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Booking does not belong to you.' });
    }

    // Check expiration if locked
    const now = new Date();
    if (booking.status === 'locked' && booking.lockedUntil < now) {
      booking.status = 'expired';
      booking.active = false;
      await booking.save();
      return res.status(400).json({ success: false, error: 'Reservation lock has expired. Please reserve a new slot.' });
    }

    if (booking.status !== 'locked' && booking.status !== 'payment_pending') {
      return res.status(400).json({ success: false, error: `Cannot process payment for booking with status: ${booking.status}` });
    }

    const station = await Station.findById(booking.stationId);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station details not found.' });
    }

    // Server financial breakdown (18% GST standard)
    const validEnergy = Math.max(1, Number(energyKwh) || booking.energyKwh || 15);
    const baseEnergyCost = Math.round(validEnergy * station.pricingPerKwh);
    const gstAmount = Math.round(baseEnergyCost * 0.18);
    const totalAmount = baseEnergyCost + gstAmount;
    const amountInPaise = totalAmount * 100;

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    let orderId;
    let gatewayType = 'mock';

    if (isRazorpayConfigured && razorpayInstance) {
      try {
        const rzpOrder = await razorpayInstance.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `rcpt_${booking._id.toString().substring(0, 14)}`,
          notes: {
            bookingId: booking._id.toString(),
            stationName: station.name,
            chargerId: booking.chargerId,
            userEmail: req.user.email,
            slotTime: booking.slotTime ? booking.slotTime.toISOString() : ''
          }
        });
        orderId = rzpOrder.id;
        gatewayType = 'razorpay';
      } catch (rzpErr) {
        console.error('Razorpay API error on order creation:', rzpErr);
        return res.status(502).json({
          success: false,
          error: `Razorpay payment order initialization failed: ${rzpErr.message}`
        });
      }
    } else if (isDevMockAllowed) {
      // Development mock mode: Server-signed order ID
      const orderSeed = `order_vs_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      orderId = orderSeed;
      gatewayType = 'mock';
    } else {
      return res.status(503).json({
        success: false,
        error: 'Production payment gateway is not configured. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
      });
    }

    booking.paymentOrderId = orderId;
    booking.paymentMethod = paymentMethod;
    booking.paymentGateway = gatewayType;
    booking.invoiceNumber = invoiceNumber;
    booking.energyKwh = validEnergy;
    booking.unitPricePerKwh = station.pricingPerKwh;
    booking.amountDue = totalAmount;
    booking.amountInPaise = amountInPaise;
    booking.taxBreakdown = {
      baseAmount: baseEnergyCost,
      gstAmount,
      totalAmount
    };
    booking.status = 'payment_pending';
    booking.paymentStatus = 'pending';
    await booking.save();

    res.json({
      success: true,
      orderId,
      amount: totalAmount,
      amountInPaise,
      currency: 'INR',
      keyId: isRazorpayConfigured ? process.env.RAZORPAY_KEY_ID : 'rzp_test_voltsync_mock',
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
        reference: booking.bookingReference,
        chargerId: booking.chargerId,
        slotTime: booking.slotTime,
        lockedUntil: booking.lockedUntil
      }
    });

  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({ success: false, error: error.message || 'Payment order initialization failed.' });
  }
});

// 3. POST /api/payments/verify - Verify payment and confirm booking with cryptographic signature verification
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
      return res.status(400).json({ success: false, error: 'bookingId, orderId, and paymentId are required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking reservation not found.' });
    }

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Booking does not belong to you.' });
    }

    if (booking.paymentOrderId && booking.paymentOrderId !== orderId) {
      return res.status(400).json({ success: false, error: 'Payment Order ID mismatch with booked order.' });
    }

    // Lock expiration check
    const now = new Date();
    if (booking.status === 'locked' && booking.lockedUntil < now) {
      booking.status = 'expired';
      booking.active = false;
      await booking.save();
      return res.status(400).json({ success: false, error: 'Reservation lock has expired before payment completion.' });
    }

    let verifiedSignature = null;

    // Razorpay signature validation if in real Razorpay mode
    if (isRazorpayConfigured && booking.paymentGateway === 'razorpay') {
      if (!signature) {
        return res.status(400).json({ success: false, error: 'Razorpay payment signature is required.' });
      }

      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const genSigBuf = Buffer.from(generatedSignature);

      if (sigBuf.length !== genSigBuf.length || !crypto.timingSafeEqual(sigBuf, genSigBuf)) {
        return res.status(400).json({ success: false, error: 'Invalid payment signature. Verification failed.' });
      }

      // Check payment status with Razorpay
      try {
        const paymentDetails = await razorpayInstance.payments.fetch(paymentId);
        if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
          return res.status(400).json({
            success: false,
            error: `Payment is in invalid status: ${paymentDetails.status}. Verification not confirmed.`
          });
        }
      } catch (fetchErr) {
        console.error('Failed to query Razorpay payment status:', fetchErr);
        return res.status(502).json({ success: false, error: 'Could not verify payment capture status with Razorpay.' });
      }

      verifiedSignature = signature;
    } else if (isDevMockAllowed && (booking.paymentGateway === 'mock' || booking.paymentGateway === 'sandbox')) {
      // Controlled Development Mock Mode
      verifiedSignature = signature || `sig_mock_verified_${crypto.createHmac('sha256', JWT_SECRET).update(`${orderId}|${paymentId}`).digest('hex').substring(0, 24)}`;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment verification request: unverified payment gateway.'
      });
    }

    // Confirm booking
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.paymentIntentId = paymentId;
    booking.paymentOrderId = orderId;
    booking.paymentSignature = verifiedSignature;
    booking.paymentMethod = paymentMethod;
    booking.amountPaid = booking.amountDue;
    booking.lockedUntil = undefined;
    await booking.save();

    const station = await Station.findById(booking.stationId);

    res.json({
      success: true,
      message: 'Payment verified and reservation confirmed!',
      booking,
      receipt: {
        invoiceNumber: booking.invoiceNumber,
        bookingReference: booking.bookingReference,
        checkInCode: booking.checkInCode,
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
    res.status(500).json({ success: false, error: error.message || 'Payment verification failed.' });
  }
});

// 4. POST /api/payments/webhook - Raw body Razorpay Webhook listener
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!webhookSecret || !signature) {
      return res.status(400).json({ success: false, error: 'Webhook signature or secret missing.' });
    }

    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook signature.' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'payment.captured' && payload && payload.payment) {
      const paymentEntity = payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      const booking = await Booking.findOne({ paymentOrderId: orderId });
      if (booking && booking.status !== 'confirmed') {
        booking.status = 'confirmed';
        booking.paymentStatus = 'paid';
        booking.paymentIntentId = paymentId;
        booking.amountPaid = booking.amountDue;
        booking.lockedUntil = undefined;
        await booking.save();
        console.log(`Webhook successfully finalized booking ${booking._id}`);
      }
    }

    res.json({ success: true, status: 'ok', received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ success: false, error: 'Webhook processing failed.' });
  }
});

// 5. GET /api/payments/receipt/:bookingId - Fetch official GST Tax Receipt
router.get('/receipt/:bookingId', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ success: false, error: 'Invalid booking ID format.' });
    }

    const booking = await Booking.findById(req.params.bookingId).populate('stationId');
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    if (booking.userEmail !== req.user.email && req.user.role !== 'operator') {
      return res.status(403).json({ success: false, error: 'Unauthorized to view this receipt.' });
    }

    res.json({
      success: true,
      invoiceNumber: booking.invoiceNumber || `INV-${booking._id.toString().slice(-6).toUpperCase()}`,
      bookingReference: booking.bookingReference || `VS-${booking._id.toString().slice(-6).toUpperCase()}`,
      checkInCode: booking.checkInCode || 'N/A',
      stationName: booking.stationId?.name || 'VoltSync Hub',
      stationAddress: 'VoltSync Smart Fast Charging Network, Gujarat, India',
      driverEmail: booking.userEmail,
      chargerId: booking.chargerId,
      slotTime: booking.slotTime,
      paymentMethod: booking.paymentMethod || 'UPI',
      transactionId: booking.paymentIntentId || 'N/A',
      taxBreakdown: booking.taxBreakdown || {
        baseAmount: Math.round((booking.amountPaid || 0) / 1.18),
        gstAmount: Math.round(((booking.amountPaid || 0) / 1.18) * 0.18),
        totalAmount: booking.amountPaid || 0
      },
      totalPaid: booking.amountPaid || 0,
      status: booking.status,
      date: booking.updatedAt || new Date()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
