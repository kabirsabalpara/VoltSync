const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  stationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Station', 
    required: true 
  },
  chargerId: { 
    type: String, 
    required: true 
  },
  slotTime: { 
    type: Date, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['locked', 'confirmed', 'cancelled', 'completed'], 
    default: 'locked' 
  },
  lockedUntil: { 
    type: Date 
  },
  amountPaid: { 
    type: Number, 
    default: 0 
  },
  paymentIntentId: { 
    type: String 
  },
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'sandbox', 'stripe', 'wallet'],
    default: 'sandbox'
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet'],
    default: 'upi'
  },
  paymentOrderId: {
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
    cessAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 }
  },
  userEmail: { 
    type: String, 
    required: true 
  },
  active: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

// Create a compound unique index to prevent double bookings.
// Only one active booking (status 'confirmed' or non-expired 'locked') is allowed per slot per charger.
// To handle this, we enforce uniqueness on (stationId, chargerId, slotTime, active).
// When a booking is cancelled or its lock expires, we set 'active' to false or remove it.
BookingSchema.index({ stationId: 1, chargerId: 1, slotTime: 1, active: 1 }, { 
  unique: true, 
  partialFilterExpression: { active: true } 
});

module.exports = mongoose.model('Booking', BookingSchema);
