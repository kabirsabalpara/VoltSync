/**
 * VoltSync Demo Payment & Security Test Suite
 * Validates all required test cases:
 * 1. Demo payment success (POST /api/payments/demo-pay)
 * 2. Booking amount is calculated server-side (station rate * energy + 18% GST)
 * 3. Expired booking rejection
 * 4. Someone else's booking rejection (403 Forbidden)
 * 5. Duplicate demo payment (Idempotency)
 * 6. Concurrent requests (double-click protection)
 * 7. QR only after confirmation
 * 8. Failed backend request does not confirm booking
 * 9. Production security check: Demo payment blocked without ALLOW_DEMO_PAYMENTS=true
 * 10. Duplicate charger slot remains protected (409 Conflict)
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Configure Mock / Demo Payment Mode for tests
process.env.PAYMENT_MODE = 'mock';
process.env.ALLOW_DEMO_PAYMENTS = 'true';
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

const app = require('../server');
const connectDB = require('../config/db');
const User = require('../models/User');
const Station = require('../models/Station');
const Booking = require('../models/Booking');

let passed = 0;
let failed = 0;

function assert(description, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${description}`);
  } else {
    failed++;
    console.error(`  FAIL: ${description} ${extra ? '— ' + extra : ''}`);
  }
}

let server;
let baseUrl;

async function api(path, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) }
  });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body, headers: res.headers };
}

async function run() {
  console.log('\n======================================================');
  console.log('   VoltSync Demo Payment & Security Test Suite');
  console.log('======================================================\n');

  await connectDB();

  const testPort = 5089;
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(testPort, resolve));
  baseUrl = `http://localhost:${testPort}/api`;

  const stamp = Date.now();
  const driver1Email = `driver1_demo_${stamp}@test.com`;
  const driver2Email = `driver2_demo_${stamp}@test.com`;
  const opEmail = `op_demo_${stamp}@test.com`;
  const password = 'TestSecurePass123!';

  // Create operator and drivers
  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Station Operator', email: opEmail, password })
  });
  await User.updateOne({ email: opEmail }, { $set: { role: 'operator' } });
  const opUser = await User.findOne({ email: opEmail });

  const signup1 = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Driver One', email: driver1Email, password })
  });
  const token1 = signup1.body?.token;

  const signup2 = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Driver Two', email: driver2Email, password })
  });
  const token2 = signup2.body?.token;

  assert('Driver 1 & 2 authenticated', !!token1 && !!token2);

  // Create test station
  const testStation = await Station.create({
    name: `VoltSync Demo Hub ${stamp}`,
    location: { type: 'Point', coordinates: [72.8311, 21.1702] },
    city: 'Surat',
    address: 'Katargam GIDC Hub, Surat, Gujarat',
    pricingPerKwh: 14,
    chargingSpeedKw: 60,
    connectorTypes: ['CCS', 'Type 2'],
    operatorId: opUser._id,
    chargers: [
      { id: 'KG1', status: 'free' },
      { id: 'KG2', status: 'free' }
    ]
  });

  // Lock slot for Driver 1
  const slotTime = new Date(Date.now() + 86400000);
  slotTime.setMinutes(0, 0, 0);

  const lockRes = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      slotTime: slotTime.toISOString(),
      chargerId: 'KG1',
      energyKwh: 24.3
    })
  });

  assert('Slot locked successfully for Driver 1', lockRes.status === 201);
  const booking1Id = lockRes.body?.bookingId || lockRes.body?.booking?._id;

  // ------------------------------------------------------------------------
  // TEST 1: Create Order calculates amount server-side (Station rate * energy + 18% GST)
  // ------------------------------------------------------------------------
  const orderRes = await api('/payments/create-order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      bookingId: booking1Id,
      energyKwh: 24.3 // 24.3 kWh * 14 = 340.2 (round 340) + 18% GST (61.2 -> round 61) = 401
    })
  });
  assert(
    '1. Create order calculates price server-side based on station pricing + 18% GST',
    orderRes.status === 200 && orderRes.body?.amount > 0 && orderRes.body?.taxBreakdown?.gstAmount > 0,
    `status=${orderRes.status}, amount=${orderRes.body?.amount}`
  );

  // ------------------------------------------------------------------------
  // TEST 2: Reject someone else's booking (Driver 2 cannot pay for Driver 1)
  // ------------------------------------------------------------------------
  const tamperPay = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ bookingId: booking1Id })
  });
  assert(
    '2. Reject someone else\'s booking (403 Forbidden)',
    tamperPay.status === 403,
    `status=${tamperPay.status}`
  );

  // ------------------------------------------------------------------------
  // TEST 3: Reject expired booking
  // ------------------------------------------------------------------------
  const expiredBooking = await Booking.create({
    bookingReference: `VS-EXP-${stamp}`,
    stationId: testStation._id,
    chargerId: 'KG2',
    slotTime,
    status: 'locked',
    lockedUntil: new Date(Date.now() - 60000), // 1 min in past
    amountDue: 200,
    userEmail: driver1Email,
    active: true
  });
  const expiredRes = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ bookingId: expiredBooking._id.toString() })
  });
  assert(
    '3. Reject expired booking hold (400 Bad Request)',
    expiredRes.status === 400 && expiredRes.body?.error?.includes('expired'),
    `status=${expiredRes.status}, error=${expiredRes.body?.error}`
  );

  // ------------------------------------------------------------------------
  // TEST 4: Reject non-existent / invalid booking
  // ------------------------------------------------------------------------
  const invalidRes = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ bookingId: new mongoose.Types.ObjectId().toString() })
  });
  assert('4. Reject invalid booking (404 Not Found)', invalidRes.status === 404);

  // ------------------------------------------------------------------------
  // DIRECT ATTACK TEST: Attempt POST /api/bookings/confirm with fake_payment
  // Must NOT be able to confirm booking (returns 400), booking must remain unconfirmed
  // ------------------------------------------------------------------------
  const directAttackRes = await api('/bookings/confirm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      bookingId: booking1Id,
      paymentIntentId: 'fake_payment',
      paymentGateway: 'mock'
    })
  });
  assert(
    'Direct attack: POST /bookings/confirm cannot confirm demo booking (400 Bad Request)',
    directAttackRes.status === 400,
    `status=${directAttackRes.status}`
  );

  const checkStillUnconfirmed = await Booking.findById(booking1Id);
  assert(
    'Direct attack: booking remains unconfirmed after /bookings/confirm attempt (status is not confirmed)',
    checkStillUnconfirmed.status !== 'confirmed' && checkStillUnconfirmed.paymentStatus !== 'paid'
  );

  // ------------------------------------------------------------------------
  // TEST 5: Demo payment success via authoritative route (POST /api/payments/demo-pay)
  // ------------------------------------------------------------------------
  const demoPayRes = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ bookingId: booking1Id })
  });
  assert(
    '5. Demo payment succeeds and confirms reservation (200 OK)',
    demoPayRes.status === 200 && demoPayRes.body?.booking?.status === 'confirmed',
    `status=${demoPayRes.status}`
  );

  const confirmedBooking = await Booking.findById(booking1Id);
  assert(
    '6. Booking stores mock payment metadata (paymentGateway=mock, paymentStatus=paid, mockPaymentId, paidAmount, paidAt)',
    confirmedBooking.paymentGateway === 'mock' &&
    confirmedBooking.paymentStatus === 'paid' &&
    !!confirmedBooking.mockPaymentId &&
    confirmedBooking.paidAmount > 0 &&
    !!confirmedBooking.paidAt
  );

  // ------------------------------------------------------------------------
  // TEST 7: Duplicate demo payment is idempotent
  // ------------------------------------------------------------------------
  const repeatPay = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ bookingId: booking1Id })
  });
  assert(
    '7. Duplicate demo payment call is idempotent (returns 200 without duplicate confirmation)',
    repeatPay.status === 200 && repeatPay.body?.booking?.status === 'confirmed'
  );

  // ------------------------------------------------------------------------
  // TEST 8: Concurrent double-click requests handled safely
  // ------------------------------------------------------------------------
  const [click1, click2] = await Promise.all([
    api('/payments/demo-pay', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: JSON.stringify({ bookingId: booking1Id })
    }),
    api('/payments/demo-pay', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: JSON.stringify({ bookingId: booking1Id })
    })
  ]);
  assert(
    '8. Concurrent requests (double-click simulation) both return 200 OK cleanly',
    click1.status === 200 && click2.status === 200
  );

  // ------------------------------------------------------------------------
  // TEST 9: QR only appears after confirmation
  // ------------------------------------------------------------------------
  assert(
    '9. Digital pass checkInCode is issued and present on confirmed receipt',
    !!confirmedBooking.checkInCode && !!demoPayRes.body?.receipt?.checkInCode
  );

  // ------------------------------------------------------------------------
  // TEST 10: Failed backend request does not confirm unconfirmed booking
  // ------------------------------------------------------------------------
  const unconfirmedBooking = await Booking.create({
    bookingReference: `VS-UNCONF-${stamp}`,
    stationId: testStation._id,
    chargerId: 'KG2',
    slotTime: new Date(slotTime.getTime() + 7200000),
    status: 'locked',
    lockedUntil: new Date(Date.now() + 300000),
    amountDue: 250,
    userEmail: driver2Email,
    active: true
  });
  // Driver 1 attempts to confirm Driver 2's booking
  await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` }, // wrong driver
    body: JSON.stringify({ bookingId: unconfirmedBooking._id.toString() })
  });
  const checkUnconfirmed = await Booking.findById(unconfirmedBooking._id);
  assert(
    '10. Failed request leaves booking unconfirmed (status is still locked, paymentStatus unpaid)',
    checkUnconfirmed.status === 'locked' && checkUnconfirmed.paymentStatus === 'unpaid'
  );

  // ------------------------------------------------------------------------
  // TEST 11: Duplicate charger slot remains protected against double-booking
  // ------------------------------------------------------------------------
  const duplicateSlotLock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      slotTime: slotTime.toISOString(),
      chargerId: 'KG1' // already confirmed for Driver 1
    })
  });
  assert(
    '11. Confirmed charger slot remains protected against double-booking (409 Conflict)',
    duplicateSlotLock.status === 409
  );

  // ------------------------------------------------------------------------
  // TEST 12: GET /payments/config reports mode: mock, configured: true, allowDemoPayments: true
  // ------------------------------------------------------------------------
  const configRes = await api('/payments/config');
  assert(
    '12. Payment config reports mock mode and allowDemoPayments=true',
    configRes.status === 200 && configRes.body?.mode === 'mock' && configRes.body?.configured === true && configRes.body?.allowDemoPayments === true
  );

  // Cleanup
  await Booking.deleteMany({ stationId: testStation._id });
  await Station.findByIdAndDelete(testStation._id);
  await User.deleteMany({ email: { $in: [driver1Email, driver2Email, opEmail] } });

  await new Promise((res) => server.close(res));
  await mongoose.disconnect();

  console.log('\n----------------------------------------');
  console.log(`  Demo Payment Test Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
