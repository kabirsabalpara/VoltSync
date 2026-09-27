const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  evModel: { type: String, default: 'Tata Nexon EV Max' },
  role: { type: String, enum: ['driver', 'operator'], default: 'driver' }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
