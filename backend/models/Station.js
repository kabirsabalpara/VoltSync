const mongoose = require('mongoose');

const ChargerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['free', 'occupied', 'maintenance'], 
    default: 'free' 
  }
});

const StationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  connectorTypes: {
    type: [String],
    enum: ['CCS', 'CHAdeMO', 'Type 2'],
    required: true
  },
  chargingSpeedKw: { type: Number, required: true },
  pricingPerKwh: { type: Number, required: true },
  chargers: [ChargerSchema],
  liveQueueLength: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Index location for geospatial queries
StationSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Station', StationSchema);
