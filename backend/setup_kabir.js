require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');
const Station = require('./models/Station');
const Booking = require('./models/Booking');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

(async () => {
  await connectDB();
  const hashedPassword = await bcrypt.hash('KabirPass123!', 10);
  
  let user = await User.findOneAndUpdate(
    { email: 'kabir@voltsync.in' },
    {
      name: 'Sabalpara Kabir HasmukhBhai',
      email: 'kabir@voltsync.in',
      password: hashedPassword,
      role: 'operator',
      evModel: 'Tata Nexon EV Max',
      phone: '9638749839'
    },
    { upsert: true, new: true }
  );

  // Assign stations to operator
  await Station.updateMany({}, { $set: { operatorId: user._id } });

  // Create confirmed booking
  const station = await Station.findOne();
  if (station) {
    await Booking.create({
      stationId: station._id,
      chargerId: station.chargers[0]?.id || 'VR1',
      slotTime: new Date(Date.now() + 3600000),
      status: 'confirmed',
      lockedUntil: new Date(Date.now() + 300000),
      amountPaid: 388,
      paymentIntentId: 'pi_sandbox_kabir_78912',
      userEmail: 'kabir@voltsync.in',
      active: true
    });
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );

  console.log('KABIR_TOKEN_SUCCESS:', token);
  process.exit(0);
})();
