require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const stationRoutes = require('../routes/stations');
const bookingRoutes = require('../routes/bookings');
const authRoutes = require('../routes/auth');
const paymentRoutes = require('../routes/payments');
const Station = require('../models/Station');
const Booking = require('../models/Booking');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const app = express();
app.use(express.json());
app.use('/api/stations', stationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);

async function runTests() {
  console.log('\n--- STARTING VERIFICATION FOR USER LOCATION & PAYMENT GATEWAY ---');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ev_charging';
  await mongoose.connect(mongoUri);

  const server = app.listen(5099, async () => {
    const baseUrl = 'http://localhost:5099/api';
    let passed = 0;
    let failed = 0;

    function assert(name, condition, details = '') {
      if (condition) {
        console.log(`  [PASS] ${name}`);
        passed++;
      } else {
        console.error(`  [FAIL] ${name} - ${details}`);
        failed++;
      }
    }

    try {
      // 1. Test Payment Config Endpoint
      const configRes = await fetch(`${baseUrl}/payments/config`);
      const configData = await configRes.json();
      assert(
        'GET /api/payments/config returns supported payment methods',
        configRes.status === 200 && Array.isArray(configData.supportedMethods) && configData.supportedMethods.length >= 4,
        JSON.stringify(configData)
      );

      // 2. Test User Location Nearby Stations Endpoint
      const nearbyRes = await fetch(`${baseUrl}/stations/nearby?lat=21.1702&lng=72.8311&radius=10`);
      const nearbyData = await nearbyRes.json();
      assert(
        'GET /api/stations/nearby returns stations near coordinates',
        nearbyRes.status === 200 && nearbyData.success === true && Array.isArray(nearbyData.stations),
        JSON.stringify(nearbyData)
      );

      if (nearbyData.stations && nearbyData.stations.length > 0) {
        const first = nearbyData.stations[0];
        assert(
          'Nearby station has calculated distance and drivingMinutes',
          typeof first.distance === 'number' && typeof first.drivingMinutes === 'number',
          `distance: ${first.distance}, drivingMinutes: ${first.drivingMinutes}`
        );
        assert(
          'Nearby station response has nearestStation metadata',
          nearbyData.nearestStation !== undefined,
          `nearestStation: ${nearbyData.nearestStation?.name}`
        );
      }

      // 3. Setup test user & token
      const testEmail = `driver_test_${Date.now()}@example.com`;
      const token = jwt.sign({ email: testEmail, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });

      // Find or create a test station
      let station = await Station.findOne({});
      if (!station) {
        station = await Station.create({
          name: 'Test Fast Charge Node',
          location: { type: 'Point', coordinates: [72.8311, 21.1702] },
          connectorTypes: ['CCS'],
          chargingSpeedKw: 150,
          pricingPerKwh: 15,
          chargers: [{ id: 'TC1', status: 'free' }]
        });
      }

      // 4. Lock a slot for booking
      const slotTime = new Date(Date.now() + 3600 * 1000 * 3); // 3 hours in future
      slotTime.setMinutes(0, 0, 0);

      const lockRes = await fetch(`${baseUrl}/bookings/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stationId: station._id,
          slotTime: slotTime.toISOString(),
          chargerId: station.chargers[0].id
        })
      });
      const lockData = await lockRes.json();
      assert(
        'POST /api/bookings/lock reserves slot for user',
        lockRes.status === 201 && lockData.bookingId,
        JSON.stringify(lockData)
      );

      const bookingId = lockData.bookingId;

      // 5. Test Payment Gateway Create Order
      const createOrderRes = await fetch(`${baseUrl}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingId,
          energyKwh: 20,
          paymentMethod: 'upi'
        })
      });
      const orderData = await createOrderRes.json();
      assert(
        'POST /api/payments/create-order generates order with GST and Green Cess breakdown',
        createOrderRes.status === 200 && 
        orderData.orderId && 
        orderData.taxBreakdown && 
        orderData.taxBreakdown.gstAmount > 0 &&
        orderData.invoiceNumber,
        JSON.stringify(orderData)
      );

      // 6. Test Payment Gateway Verify & Confirmation
      const verifyRes = await fetch(`${baseUrl}/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingId,
          orderId: orderData.orderId,
          paymentId: `pay_upi_test_${Date.now()}`,
          signature: 'sig_test_valid',
          paymentMethod: 'upi'
        })
      });
      const verifyData = await verifyRes.json();
      assert(
        'POST /api/payments/verify confirms booking and generates receipt',
        verifyRes.status === 200 && 
        verifyData.success === true && 
        verifyData.booking.status === 'confirmed',
        JSON.stringify(verifyData)
      );

      // 7. Test Payment GST Receipt Retrieval
      const receiptRes = await fetch(`${baseUrl}/payments/receipt/${bookingId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const receiptData = await receiptRes.json();
      assert(
        'GET /api/payments/receipt/:id returns full tax invoice details',
        receiptRes.status === 200 && receiptData.invoiceNumber && receiptData.taxBreakdown,
        JSON.stringify(receiptData)
      );

      // Clean up test booking
      await Booking.deleteOne({ _id: bookingId });

    } catch (e) {
      console.error('Test execution error:', e);
      failed++;
    } finally {
      server.close();
      await mongoose.disconnect();
      console.log(`\nTEST RESULTS: ${passed} PASSED, ${failed} FAILED\n`);
      process.exit(failed === 0 ? 0 : 1);
    }
  });
}

runTests();
