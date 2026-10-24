require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Station = require('../models/Station');
const User = require('../models/User');

const targetOperatorEmail = process.argv[2] || 'operator@example.com';

(async () => {
  try {
    await connectDB();
    console.log(`Checking for ownerless stations to migrate under: ${targetOperatorEmail}`);

    let operator = await User.findOne({ email: targetOperatorEmail.toLowerCase() });
    if (!operator) {
      console.log(`Operator account ${targetOperatorEmail} not found. Creating placeholder operator...`);
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('OperatorPass123!', salt);
      operator = await User.create({
        name: 'Default Network Operator',
        email: targetOperatorEmail.toLowerCase(),
        password: hashedPassword,
        role: 'operator',
        phone: '+91 98765 43210'
      });
    }

    const result = await Station.updateMany(
      { $or: [{ operatorId: null }, { operatorId: { $exists: false } }] },
      { $set: { operatorId: operator._id } }
    );

    console.log(`Migration complete. Assigned ${result.modifiedCount} ownerless station(s) to operator: ${operator.email} (${operator._id})`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
