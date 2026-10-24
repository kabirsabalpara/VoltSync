require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');
const Station = require('./models/Station');
const Booking = require('./models/Booking');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

(async () => {
  await connectDB();
  const hashedPassword = await bcrypt.hash('OperatorPass123!', 10);
  
  let opUser = await User.findOneAndUpdate(
    { email: 'operator@example.com' },
    {
      name: 'Brijesh Dhanani (Operator)',
      email: 'operator@example.com',
      password: hashedPassword,
      role: 'operator'
    },
    { upsert: true, new: true }
  );

  let kabirUser = await User.findOneAndUpdate(
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
  await Station.updateMany({}, { operatorId: opUser._id });

  // Create a confirmed booking with revenue
  const station = await Station.findOne();
  if (station) {
    await Booking.create({
      stationId: station._id,
      chargerId: station.chargers[0]?.id || 'VR1',
      slotTime: new Date(Date.now() + 3600000),
      status: 'confirmed',
      lockedUntil: new Date(Date.now() + 300000),
      amountPaid: 840,
      paymentIntentId: 'pi_sandbox_operator_rev_902',
      userEmail: 'kabir@voltsync.in',
      active: true
    });
  }

  const opToken = jwt.sign(
    { id: opUser._id, email: opUser.email, role: opUser.role, name: opUser.name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );

  console.log('OPERATOR_TOKEN_SUCCESS:', opToken);
  process.exit(0);
})();
