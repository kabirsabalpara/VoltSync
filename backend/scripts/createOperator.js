require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/createOperator.js <email>');
  process.exit(1);
}

(async () => {
  await connectDB();
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { role: 'operator' } },
    { new: true }
  );
  if (!user) {
    console.error(`No user found with email ${email}. They must sign up first.`);
  } else {
    console.log(`${user.email} is now an operator.`);
  }
  await mongoose.disconnect();
})();
