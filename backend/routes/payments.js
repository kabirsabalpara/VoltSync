const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../config/jwt');

// Determine payment configuration
const paymentMode = process.env.PAYMENT_MODE || 'mock';

// Demo payments are allowed when explicitly enabled via ALLOW_DEMO_PAYMENTS=true,
// or in non-production environments when PAYMENT_MODE=mock.
// In production, demo payments will NOT be silently enabled unless ALLOW_DEMO_PAYMENTS=true.
const allowDemoPayments = (
  process.env.ALLOW_DEMO_PAYMENTS === 'true' ||
  (paymentMode === 'mock' && process.env.NODE_ENV !== 'production')
);

const isMockMode = (paymentMode === 'mock' && allowDemoPayments) || (allowDemoPayments && !process.env.RAZORPAY_KEY_ID);

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

// Validate configured Razorpay API credentials (optional)
const isRazorpayConfigured = Boolean(
  paymentMode === 'razorpay' &&
  razorpayKeyId && 
  razorpayKeySecret &&
  !razorpayKeyId.includes('placeholder') &&
  razorpayKeyId.startsWith('rzp_')
);

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
  console.log('Running in secure demo mock mode (PAYMENT_MODE=mock, ALLOW_DEMO_PAYMENTS=true).');
} else {
  console.warn('Payment service awaiting configuration (PAYMENT_MODE=' + paymentMode + ').');
}

// 1. GET /api/payments/config - Get payment gateway capabilities (no secrets exposed)
router.get('/config', (req, res) => {
  if (isMockMode) {
    return res.json({
      success: true,
      mode: 'mock',
      configured: true,
      allowDemoPayments: true,
      currency: 'INR',
      supportedMethods: [
        { id: 'demo', name: 'Demo Transaction', description: 'Zero real money charged' }
      ]
    });
  }

  if (paymentMode === 'mock' && !allowDemoPayments) {
    return res.json({
      success: true,
      mode: 'mock',
      configured: false,
      allowDemoPayments: false,
      error: 'Demo payment mode is disabled in production without ALLOW_DEMO_PAYMENTS=true.'
    });
  }

  res.json({
    success: true,
    mode: paymentMode,
    configured: isRazorpayConfigured,
    allowDemoPayments: false,
    keyId: isRazorpayConfigured ? razorpayKeyId : null,
    currency: 'INR',
    supportedMethods: isRazorpayConfigured ? [
      { id: 'upi', name: 'Instant UPI / QR Code', description: 'GPay, PhonePe, Paytm, BHIM UPI' },
      { id: 'card', name: 'Credit & Debit Cards', description: 'Visa, Mastercard, RuPay' },
      { id: 'netbanking', name: 'Net Banking', description: 'All Major Indian Banks' },
      { id: 'wallet', name: 'Wallets', description: 'Mobikwik, Freecharge, Airtel Money' }
    ] : []
  });
});

// Helper: Authoritative price calculation
function calculateAuthoritativePrice(station, energyKwh, fallbackUnitPrice = 14) {
  const unitPrice = station?.pricingPerKwh || fallbackUnitPrice;
  const validEnergy = Math.max(1, Number(energyKwh) || 15);
  const baseEnergyCost = Math.round(validEnergy * unitPrice);
  const gstAmount = Math.round(baseEnergyCost * 0.18);
  const totalAmount = baseEnergyCost + gstAmount;
  const amountInPaise = totalAmount * 100;
  return {
    validEnergy,
    unitPrice,
    baseEnergyCost,
    gstAmount,
    totalAmount,
    amountInPaise
  };
}

// 2. POST /api/payments/create-order - Create server-authoritative payment order
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

    // Check expiration if locked or payment_pending
    const now = new Date();
    if (['locked', 'payment_pending'].includes(booking.status) && booking.lockedUntil && booking.lockedUntil <= now) {
      booking.status = 'expired';
      booking.active = false;
      booking.paymentStatus = 'failed';
      await booking.save();
      return res.status(400).json({ success: false, error: 'Your reservation hold has expired. Please select another slot.' });
    }

    if (booking.status === 'confirmed') {
      return res.json({
        success: true,
        message: 'Booking is already confirmed.',
        booking
      });
    }

    if (booking.status !== 'locked' && booking.status !== 'payment_pending') {
      return res.status(400).json({ success: false, error: `Cannot process payment for booking with status: ${booking.status}` });
    }

    const station = await Station.findById(booking.stationId);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station details not found.' });
    }

    // Recalculate price server-side strictly from trusted station pricing
    const pricing = calculateAuthoritativePrice(station, energyKwh || booking.energyKwh, station.pricingPerKwh);

    let orderId;
    let gatewayType = 'mock';

    if (isMockMode) {
      orderId = `order_vs_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      gatewayType = 'mock';
    } else if (paymentMode === 'razorpay') {
      if (!isRazorpayConfigured || !razorpayInstance) {
        return res.status(503).json({
          success: false,
          error: 'Payment service is temporarily unavailable. Please try again later.'
        });
      }

      try {
        const rzpOrder = await razorpayInstance.orders.create({
          amount: pricing.amountInPaise,
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
    } else {
      return res.status(503).json({
        success: false,
        error: 'Payment service is temporarily unavailable. Please try again later.'
      });
    }

    const invoiceNumber = booking.invoiceNumber || `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    booking.paymentOrderId = orderId;
    booking.paymentGateway = gatewayType;
    booking.invoiceNumber = invoiceNumber;
    booking.energyKwh = pricing.validEnergy;
    booking.unitPricePerKwh = pricing.unitPrice;
    booking.amountDue = pricing.totalAmount;
    booking.amountInPaise = pricing.amountInPaise;
    booking.taxBreakdown = {
      baseAmount: pricing.baseEnergyCost,
      gstAmount: pricing.gstAmount,
      totalAmount: pricing.totalAmount
    };
    booking.status = 'payment_pending';
    booking.paymentStatus = 'pending';
    await booking.save();

    res.json({
      success: true,
      orderId,
      amount: pricing.totalAmount,
      amountInPaise: pricing.amountInPaise,
      currency: 'INR',
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

// 3. POST /api/payments/demo-pay - Secure Server-Authoritative Demo Payment Confirmation
router.post('/demo-pay', authMiddleware, async (req, res) => {
  try {
    const { bookingId, energyKwh } = req.body;

    if (!allowDemoPayments) {
      return res.status(403).json({
        success: false,
        error: 'Demo payment mode is disabled. Set ALLOW_DEMO_PAYMENTS=true.'
      });
    }

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

    // Idempotency check: If booking is already confirmed, return success without duplicate confirmation
    if (booking.status === 'confirmed') {
      const station = await Station.findById(booking.stationId);
      return res.json({
        success: true,
        message: 'Demo payment already completed. Reservation confirmed!',
        booking,
        receipt: {
          invoiceNumber: booking.invoiceNumber,
          bookingReference: booking.bookingReference,
          checkInCode: booking.checkInCode,
          mockPaymentId: booking.mockPaymentId || booking.paymentIntentId,
          transactionId: booking.mockPaymentId || booking.paymentIntentId,
          orderId: booking.paymentOrderId,
          paymentGateway: 'mock',
          paymentMethod: 'Demo Payment',
          stationName: station ? station.name : 'VoltSync Hub',
          chargerId: booking.chargerId,
          slotTime: booking.slotTime,
          energyKwh: booking.energyKwh,
          unitPricePerKwh: booking.unitPricePerKwh,
          taxBreakdown: booking.taxBreakdown,
          totalPaid: booking.amountPaid,
          paidAmount: booking.amountPaid,
          paidAt: booking.paidAt || booking.updatedAt,
          timestamp: (booking.paidAt || booking.updatedAt || new Date()).toISOString()
        }
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking reservation has been cancelled.' });
    }

    // Verify lock expiration for both locked and payment_pending holds
    const now = new Date();
    if (['locked', 'payment_pending'].includes(booking.status) && booking.lockedUntil && booking.lockedUntil <= now) {
      booking.status = 'expired';
      booking.active = false;
      booking.paymentStatus = 'failed';
      await booking.save();
      return res.status(400).json({ success: false, error: 'Your reservation hold has expired. Please reserve the charger again.' });
    }

    const station = await Station.findById(booking.stationId);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station details not found.' });
    }

    // Server-side authoritative calculation: Client cannot manipulate price
    const pricing = calculateAuthoritativePrice(station, energyKwh || booking.energyKwh, station.pricingPerKwh);

    // Generate mock transaction ID and passes server-side
    const mockPaymentId = `mock_tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const mockOrderId = booking.paymentOrderId || `order_vs_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const invoiceNumber = booking.invoiceNumber || `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const checkInCode = booking.checkInCode || `VP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const paidAt = new Date();

    // Confirm booking and persist mock payment details
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.paymentGateway = 'mock';
    booking.paymentMethod = 'mock';
    booking.paymentIntentId = mockPaymentId;
    booking.mockPaymentId = mockPaymentId;
    booking.paymentOrderId = mockOrderId;
    booking.invoiceNumber = invoiceNumber;
    booking.checkInCode = checkInCode;
    booking.amountDue = pricing.totalAmount;
    booking.amountPaid = pricing.totalAmount;
    booking.paidAmount = pricing.totalAmount;
    booking.amountInPaise = pricing.amountInPaise;
    booking.paidAt = paidAt;
    booking.unitPricePerKwh = pricing.unitPrice;
    booking.energyKwh = pricing.validEnergy;
    booking.taxBreakdown = {
      baseAmount: pricing.baseEnergyCost,
      gstAmount: pricing.gstAmount,
      totalAmount: pricing.totalAmount
    };
    booking.lockedUntil = undefined;
    await booking.save();

    res.json({
      success: true,
      message: 'Demo payment completed successfully. Reservation confirmed!',
      booking,
      receipt: {
        invoiceNumber: booking.invoiceNumber,
        bookingReference: booking.bookingReference,
        checkInCode: booking.checkInCode,
        mockPaymentId: mockPaymentId,
        transactionId: mockPaymentId,
        orderId: mockOrderId,
        paymentGateway: 'mock',
        paymentMethod: 'Demo Payment',
        stationName: station.name,
        chargerId: booking.chargerId,
        slotTime: booking.slotTime,
        energyKwh: pricing.validEnergy,
        unitPricePerKwh: pricing.unitPrice,
        taxBreakdown: booking.taxBreakdown,
        totalPaid: pricing.totalAmount,
        paidAmount: pricing.totalAmount,
        paidAt,
        timestamp: paidAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Error processing demo payment:', error);
    res.status(500).json({ success: false, error: 'Payment could not be completed. Please try again.' });
  }
});

// 4. POST /api/payments/verify - Verification endpoint (Supports mock and optional Razorpay)
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
      paymentMethod = 'mock' 
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
    if (booking.status === 'confirmed' && (booking.paymentIntentId === paymentId || booking.mockPaymentId === paymentId)) {
      const station = await Station.findById(booking.stationId);
      return res.json({
        success: true,
        message: 'Payment verified and reservation confirmed!',
        booking,
        receipt: {
          invoiceNumber: booking.invoiceNumber,
          bookingReference: booking.bookingReference,
          checkInCode: booking.checkInCode,
          mockPaymentId: booking.mockPaymentId || paymentId,
          transactionId: paymentId,
          orderId,
          paymentGateway: booking.paymentGateway,
          paymentMethod: booking.paymentMethod || paymentMethod,
          stationName: station ? station.name : 'VoltSync Hub',
          chargerId: booking.chargerId,
          slotTime: booking.slotTime,
          taxBreakdown: booking.taxBreakdown,
          totalPaid: booking.amountPaid,
          paidAmount: booking.amountPaid,
          timestamp: (booking.paidAt || booking.updatedAt || new Date()).toISOString()
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

    // Lock expiration check for both locked and payment_pending holds
    const now = new Date();
    if (['locked', 'payment_pending'].includes(booking.status) && booking.lockedUntil && booking.lockedUntil <= now) {
      booking.status = 'expired';
      booking.active = false;
      booking.paymentStatus = 'failed';
      await booking.save();
      return res.status(400).json({ success: false, error: 'Your reservation hold has expired. Please reserve the charger again.' });
    }

    let verifiedSignature = null;

    if (isMockMode || booking.paymentGateway === 'mock' || allowDemoPayments) {
      verifiedSignature = signature || `sig_mock_verified_${crypto.randomBytes(8).toString('hex')}`;
    } else if (booking.paymentGateway === 'razorpay' || paymentMode === 'razorpay') {
      if (!signature) {
        return res.status(400).json({ success: false, error: 'Payment signature is required.' });
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
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment verification request: unverified payment gateway.'
      });
    }

    const station = await Station.findById(booking.stationId);
    const pricing = calculateAuthoritativePrice(station, booking.energyKwh, station ? station.pricingPerKwh : 14);
    const paidAt = new Date();

    // Confirm booking
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.paymentGateway = (isMockMode || allowDemoPayments) ? 'mock' : 'razorpay';
    booking.paymentMethod = (isMockMode || allowDemoPayments) ? 'mock' : (['upi', 'card', 'netbanking', 'wallet', 'razorpay'].includes(paymentMethod) ? paymentMethod : 'upi');
    booking.paymentIntentId = paymentId;
    booking.mockPaymentId = paymentId;
    booking.paymentOrderId = orderId;
    booking.paymentSignature = verifiedSignature;
    booking.amountPaid = pricing.totalAmount;
    booking.paidAmount = pricing.totalAmount;
    booking.amountDue = pricing.totalAmount;
    booking.paidAt = paidAt;
    booking.lockedUntil = undefined;
    if (!booking.checkInCode) {
      booking.checkInCode = `VP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }
    await booking.save();

    res.json({
      success: true,
      message: 'Payment verified and reservation confirmed!',
      booking,
      receipt: {
        invoiceNumber: booking.invoiceNumber,
        bookingReference: booking.bookingReference,
        checkInCode: booking.checkInCode,
        mockPaymentId: paymentId,
        transactionId: paymentId,
        orderId,
        paymentGateway: booking.paymentGateway,
        paymentMethod: booking.paymentMethod,
        stationName: station ? station.name : 'VoltSync Hub',
        chargerId: booking.chargerId,
        slotTime: booking.slotTime,
        taxBreakdown: booking.taxBreakdown,
        totalPaid: booking.amountPaid,
        paidAmount: booking.amountPaid,
        paidAt,
        timestamp: paidAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, error: 'Payment verification failed.' });
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
      paymentMethod: booking.paymentMethod || 'Demo Payment',
      transactionId: booking.mockPaymentId || booking.paymentIntentId || 'N/A',
      mockPaymentId: booking.mockPaymentId || booking.paymentIntentId || 'N/A',
      taxBreakdown: booking.taxBreakdown || {
        baseAmount: Math.round((booking.amountPaid || 0) / 1.18),
        gstAmount: Math.round(((booking.amountPaid || 0) / 1.18) * 0.18),
        totalAmount: booking.amountPaid || 0
      },
      totalPaid: booking.amountPaid || 0,
      paidAmount: booking.amountPaid || 0,
      status: booking.status,
      date: booking.paidAt || booking.updatedAt || new Date()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
