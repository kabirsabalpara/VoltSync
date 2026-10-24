require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const seedData = require('../config/seed');

(async () => {
  try {
    console.log('Connecting to database for seeding...');
    await connectDB();
    console.log('Seeding initial station and booking data...');
    await seedData();
    console.log('Database seeded successfully.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
})();
