const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const DEMO_EMAIL = 'operator.demo@voltsync.app';
const DEMO_NAME = 'VoltSync Demo Operator';
const DEMO_ROLE = 'operator';

async function createDemoOperator() {
  const demoPassword = process.env.DEMO_OPERATOR_PASSWORD;
  if (!demoPassword) {
    throw new Error('DEMO_OPERATOR_PASSWORD environment variable is not defined.');
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ev_charging';

  await mongoose.connect(uri);

  const normalizedEmail = DEMO_EMAIL.trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(demoPassword, salt);

  let status = '';
  if (user) {
    user.name = DEMO_NAME;
    user.role = DEMO_ROLE;
    user.password = hashedPassword;
    await user.save();
    status = 'updated';
  } else {
    user = new User({
      name: DEMO_NAME,
      email: normalizedEmail,
      password: hashedPassword,
      role: DEMO_ROLE
    });
    await user.save();
    status = 'created';
  }

  console.log(`account: ${status}`);
  console.log(`email: ${user.email}`);
  console.log(`role: ${user.role}`);

  await mongoose.disconnect();
  return { status, email: user.email, role: user.role };
}

if (require.main === module) {
  createDemoOperator()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error in createDemoOperator:', err.message);
      process.exit(1);
    });
}

module.exports = createDemoOperator;
