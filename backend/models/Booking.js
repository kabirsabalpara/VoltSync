const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  bookingReference: {
    type: String,
    unique: true,
    sparse: true
  },
  stationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Station', 
    required: true,
    index: true
  },
  chargerId: { 
    type: String, 
    required: true 
  },
  connectorType: {
    type: String,
    default: 'CCS'
  },
  slotTime: { 
    type: Date, 
    required: true 
  },
  slotDurationMinutes: {
    type: Number,
    default: 60
  },
  status: { 
    type: String, 
    enum: ['locked', 'payment_pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired', 'refunded'], 
    default: 'locked',
    index: true
  },
  lockedUntil: { 
    type: Date,
    index: true
  },
  energyKwh: {
    type: Number,
    default: 15
  },
  unitPricePerKwh: {
    type: Number,
    default: 15
  },
  amountDue: {
    type: Number,
    default: 0
  },
  amountPaid: { 
    type: Number, 
    default: 0 
  },
  amountInPaise: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded'],
    default: 'unpaid'
  },
  // Payment gateway provider: 'mock' for self-contained demo transactions, 'razorpay' if live gateway is active
  paymentGateway: {
    type: String,
    enum: ['mock', 'razorpay', 'sandbox', 'wallet'],
    default: 'mock'
  },
  // Payment instrument / method type: 'mock'/'demo' for demo mode, or 'upi', 'card', 'netbanking', 'wallet'
  paymentMethod: {
    type: String,
    enum: ['mock', 'demo', 'upi', 'card', 'netbanking', 'wallet', 'razorpay'],
    default: 'mock'
  },
  mockPaymentId: {
    type: String
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  paidAt: {
    type: Date
  },
  paymentOrderId: {
    type: String,
    index: true
  },
  paymentIntentId: { 
    type: String 
  },
  paymentSignature: {
    type: String
  },
  invoiceNumber: {
    type: String
  },
  taxBreakdown: {
    baseAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 }
  },
  // Opaque verifiable check-in pass
  checkInCode: {
    type: String,
    unique: true,
    sparse: true
  },
  checkInStatus: {
    type: String,
    enum: ['pending', 'checked_in', 'expired'],
    default: 'pending'
  },
  checkedInAt: {
    type: Date
  },
  userEmail: { 
    type: String, 
    required: true,
    index: true
  },
  active: { 
    type: Boolean, 
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound unique index ensuring only one active booking per station, charger, and canonical slot time
BookingSchema.index({ stationId: 1, chargerId: 1, slotTime: 1, active: 1 }, { 
  unique: true, 
  partialFilterExpression: { active: true } 
});

module.exports = mongoose.model('Booking', BookingSchema);
