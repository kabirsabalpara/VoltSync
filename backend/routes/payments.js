const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../config/jwt');

// Determine payment mode: Default to 'razorpay'
const paymentMode = process.env.PAYMENT_MODE || (process.env.RAZORPAY_KEY_ID ? 'razorpay' : 'razorpay');
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

// Validate configured Razorpay API credentials
const isRazorpayConfigured = Boolean(
  razorpayKeyId && 
  razorpayKeySecret &&
  !razorpayKeyId.includes('placeholder') &&
  razorpayKeyId.startsWith('rzp_')
);

// Offline mock mode is ONLY allowed if explicitly set to 'mock' and not in production
const isMockMode = paymentMode === 'mock' && process.env.NODE_ENV !== 'production';

let razorpayInstance = null;
if (isRazorpayConfigured) {
  try {
    razorpayInstance = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret
    });
    console.log('Razorpay Gateway initialized with Key ID:', razorpayKeyId);
  } catch (err) {
    console.error('Error initializing Razorpay client:', err.message);
  }
} else if (isMockMode) {
  console.log('Running in explicit offline mock mode (PAYMENT_MODE=mock).');
} else {
  console.warn('Razorpay mode active. Live/Test credentials pending in environment variables.');
}

// 1. GET /api/payments/config - Get payment gateway capabilities (no secrets exposed)
router.get('/config', (req, res) => {
  if (isMockMode) {
    return res.json({
      success: true,
      mode: 'mock',
      configured: true,
      keyId: 'rzp_test_voltsync_mock',
      currency: 'INR',
      supportedMethods: [
        { id: 'upi', name: 'Instant UPI / QR Code', description: 'GPay, PhonePe, Paytm, BHIM UPI' },
        { id: 'card', name: 'Credit & Debit Cards', description: 'Visa, Mastercard, RuPay' },
        { id: 'netbanking', name: 'Net Banking', description: 'All Major Indian Banks' },
        { id: 'wallet', name: 'Wallets', description: 'Mobikwik, Freecharge, Airtel Money' }
      ]
    });
  }

  res.json({
    success: true,
    mode: 'razorpay',
    configured: isRazorpayConfigured,
    keyId: isRazorpayConfigured ? razorpayKeyId : null,
    currency: 'INR',
    supportedMethods: [
      { id: 'upi', name: 'Instant UPI / QR Code', description: 'GPay, PhonePe, Paytm, BHIM UPI' },
      { id: 'card', name: 'Credit & Debit Cards', description: 'Visa, Mastercard, RuPay' },
      { id: 'netbanking', name: 'Net Banking', description: 'All Major Indian Banks' },
      { id: 'wallet', name: 'Wallets', description: 'Mobikwik, Freecharge, Airtel Money' }
    ]
  });
});

// 2. POST /api/payments/create-order - Create server-authoritative Razorpay order tied to authenticated booking
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { bookingId, energyKwh } = req.body;

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

    // Server-side authoritative calculation (18% GST standard)
    const validEnergy = Math.max(1, Number(energyKwh) || booking.energyKwh || 15);
    const baseEnergyCost = Math.round(validEnergy * station.pricingPerKwh);
    const gstAmount = Math.round(baseEnergyCost * 0.18);
    const totalAmount = baseEnergyCost + gstAmount;
    const amountInPaise = totalAmount * 100;

    let orderId;
    let gatewayType = 'razorpay';

    if (paymentMode === 'razorpay') {
      if (!isRazorpayConfigured || !razorpayInstance) {
        return res.status(503).json({
          success: false,
          error: 'Payment service is temporarily unavailable. Please try again later.'
        });
      }

      try {
        const rzpOrder = await razorpayInstance.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `rcpt_${booking._id.toString().slice(-14)}`,
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
        console.error('Razorpay API error on order creation:', rzpErr.message);
        return res.status(502).json({
          success: false,
          error: `Razorpay payment order initialization failed: ${rzpErr.message}`
        });
      }
    } else if (isMockMode) {
      orderId = `order_vs_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      gatewayType = 'mock';
    } else {
      return res.status(503).json({
        success: false,
        error: 'Payment service is temporarily unavailable. Please try again later.'
      });
    }

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    booking.paymentOrderId = orderId;
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
      keyId: isRazorpayConfigured ? razorpayKeyId : (isMockMode ? 'rzp_test_voltsync_mock' : null),
      bookingId: booking._id,
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

// 3. POST /api/payments/verify - Cryptographically verify payment and confirm booking
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { 
      bookingId, 
      orderId: bodyOrderId, 
      paymentId: bodyPaymentId, 
      signature: bodySignature,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentMethod = 'razorpay' 
    } = req.body;

    const orderId = bodyOrderId || razorpay_order_id;
    const paymentId = bodyPaymentId || razorpay_payment_id;
    const signature = bodySignature || razorpay_signature;

    if (!bookingId || !orderId || !paymentId) {
      return res.status(400).json({ 
        success: false, 
        error: 'bookingId, orderId, and paymentId are required.' 
      });
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

    // Idempotency: If booking was already confirmed with this same payment
    if (booking.status === 'confirmed' && booking.paymentIntentId === paymentId && booking.paymentOrderId === orderId) {
      const station = await Station.findById(booking.stationId);
      return res.json({
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
          paymentMethod: booking.paymentMethod || paymentMethod,
          stationName: station ? station.name : 'VoltSync Hub',
          chargerId: booking.chargerId,
          slotTime: booking.slotTime,
          taxBreakdown: booking.taxBreakdown,
          totalPaid: booking.amountPaid,
          timestamp: booking.updatedAt || new Date().toISOString()
        }
      });
    }

    // Check if cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking reservation has been cancelled.' });
    }

    // Verify order ID matches booking order ID
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

    if (booking.paymentGateway === 'razorpay' || paymentMode === 'razorpay') {
      if (!signature) {
        return res.status(400).json({ success: false, error: 'Razorpay payment signature is required.' });
      }

      if (!razorpayKeySecret) {
        return res.status(503).json({ success: false, error: 'Payment verification secret is not configured.' });
      }

      const generatedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const genSigBuf = Buffer.from(generatedSignature);

      if (sigBuf.length !== genSigBuf.length || !crypto.timingSafeEqual(sigBuf, genSigBuf)) {
        return res.status(400).json({ success: false, error: 'Invalid payment signature. Verification failed.' });
      }

      verifiedSignature = signature;
    } else if (isMockMode && booking.paymentGateway === 'mock') {
      verifiedSignature = signature || `sig_mock_verified_${crypto.randomBytes(8).toString('hex')}`;
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
    booking.paymentMethod = ['upi', 'card', 'netbanking', 'wallet', 'razorpay'].includes(paymentMethod) ? paymentMethod : 'upi';
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

// 4. POST /api/payments/webhook - Raw body Razorpay Webhook listener with signature check
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

