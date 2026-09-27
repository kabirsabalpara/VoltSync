const mongoose = require('mongoose');
const Station = require('../models/Station');
const Booking = require('../models/Booking');
const seedData = require('../config/seed');

const runTest = async () => {
  console.log('--- STARTING CONCURRENCY LOCK TEST ---');
  
  // 1. Connect to database
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/ev_charging');
    console.log('Connected to MongoDB.');
    // Seed database to ensure fresh test case data
    await seedData();
  } catch (err) {
    console.error('Failed to connect or seed MongoDB:', err.message);
    process.exit(1);
  }

  try {
    // 2. Find Station B (Residential Area) which has free chargers
    const station = await Station.findOne({ name: 'Station B (Residential Area)' });

    if (!station) {
      console.error('Test failed: Seed station not found. Please run the server first to seed database.');
      mongoose.disconnect();
      process.exit(1);
    }

    const chargerId = 'B1'; // Charger B1 is free
    const now = new Date();
    const slotTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 2, 0, 0, 0); // 2 hours from now

    // Ensure any existing booking for this slot is cleared
    await Booking.deleteMany({
      stationId: station._id,
      chargerId,
      slotTime
    });

    console.log(`Testing concurrency on Station: ${station.name}, Charger: ${chargerId}, Slot: ${slotTime.toISOString()}`);

    // 3. Prepare two requests to send concurrently
    const requestBody1 = {
      stationId: station._id.toString(),
      chargerId,
      slotTime: slotTime.toISOString(),
      userEmail: 'user1@example.com'
    };

    const requestBody2 = {
      stationId: station._id.toString(),
      chargerId,
      slotTime: slotTime.toISOString(),
      userEmail: 'user2@example.com'
    };

    // We start the server locally or simulate the request using mongoose calls directly.
    // Wait, simulating with HTTP requires the server to be running.
    // If we test the underlying mongoose logic directly, we can run two parallel mongoose operations!
    // Mongoose logic represents the API endpoint code exactly:
    // Let's create two functions that run the database queries in parallel.
    
    const attemptLock = async (reqBody, reqId) => {
      // Simulation of /api/bookings/lock logic:
      console.log(`[Request ${reqId}] Attempting lock...`);
      try {
        // Find if slot is booked
        const activeBooking = await Booking.findOne({
          stationId: reqBody.stationId,
          chargerId: reqBody.chargerId,
          slotTime: reqBody.slotTime,
          active: true
        });

        if (activeBooking) {
          console.log(`[Request ${reqId}] Checked: Already Booked.`);
          return { status: 409, message: 'Already Booked' };
        }

        // Try to insert
        const newBooking = new Booking({
          stationId: reqBody.stationId,
          chargerId: reqBody.chargerId,
          slotTime: reqBody.slotTime,
          status: 'locked',
          lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
          userEmail: reqBody.userEmail,
          active: true
        });

        await newBooking.save();
        console.log(`[Request ${reqId}] Saved successfully!`);
        return { status: 201, booking: newBooking };
      } catch (error) {
        if (error.code === 11000) {
          console.log(`[Request ${reqId}] Duplicate key error (11000) caught!`);
          return { status: 409, message: 'Concurrency Conflict' };
        }
        console.log(`[Request ${reqId}] Error: ${error.message}`);
        return { status: 500, error: error.message };
      }
    };

    // Run BOTH in parallel
    console.log('Firing both requests concurrently...');
    const results = await Promise.all([
      attemptLock(requestBody1, 'A'),
      attemptLock(requestBody2, 'B')
    ]);

    console.log('\n--- RESULTS ---');
    console.log('Request A Result:', results[0]);
    console.log('Request B Result:', results[1]);

    const statuses = results.map(r => r.status);
    const successCount = statuses.filter(s => s === 201).length;
    const conflictCount = statuses.filter(s => s === 409).length;

    if (successCount === 1 && conflictCount === 1) {
      console.log('\nSUCCESS: Exactly one booking succeeded, and the other failed with conflict!');
    } else {
      console.error(`\nFAILURE: Expected 1 success and 1 conflict, but got ${successCount} success and ${conflictCount} conflict.`);
    }

    // Cleanup
    await Booking.deleteMany({
      stationId: station._id,
      chargerId,
      slotTime
    });
    console.log('Cleanup completed.');

  } catch (err) {
    console.error('Test encountered an error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB. Test ended.');
  }
};

runTest();
