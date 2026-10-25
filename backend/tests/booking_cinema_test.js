/**
 * VoltSync Cinema-Seat Booking & Reservation Logic Test Suite
 * Validates required tests:
 * TEST A: Book KG1 at 10:00–11:00 -> KG1 at 10:00–11:00 unavailable, KG1 at 11:00–12:00 available.
 * TEST B: Hold KG1 at 10:00–11:00 -> Second user attempts same charger/time -> 409 Conflict.
 * TEST C: Hold expires -> Second user attempts same charger/time -> success.
 * TEST D: Confirm KG1 at 10:00–11:00 -> Another user can still book KG2 at 10:00–11:00.
 * TEST E: Same user already has KG1 at 10:00–11:00 -> Same user attempts KG2 at 10:00–11:00 -> 409 Conflict.
 * TEST F: Booking finishes -> remains in history as completed, future/non-overlapping slots available.
 * TEST G: Cancel future booking -> that exact charger/time becomes available again.
 * TEST H: Concurrent lock requests for same charger/time -> exactly one success.
 */

require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');

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
  console.log('   VoltSync Cinema-Seat Booking Logic Test Suite');
  console.log('======================================================\n');

  await connectDB();

  const testPort = 5092;
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(testPort, resolve));
  baseUrl = `http://localhost:${testPort}/api`;

  const stamp = Date.now();
  const userAEmail = `driverA_cinema_${stamp}@test.com`;
  const userBEmail = `driverB_cinema_${stamp}@test.com`;
  const opEmail = `op_cinema_${stamp}@test.com`;

  // 1. Create Users
  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'User A', email: userAEmail, password: 'SecurePassword123!' })
  });
  const resLoginA = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: userAEmail, password: 'SecurePassword123!' })
  });
  const tokenA = resLoginA.body?.token;

  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'User B', email: userBEmail, password: 'SecurePassword123!' })
  });
  const resLoginB = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: userBEmail, password: 'SecurePassword123!' })
  });
  const tokenB = resLoginB.body?.token;

  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Op Cinema', email: opEmail, password: 'SecurePassword123!' })
  });
  await User.updateOne({ email: opEmail }, { role: 'operator' });
  const resLoginOp = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: opEmail, password: 'SecurePassword123!' })
  });
  const tokenOp = resLoginOp.body?.token;

  assert('Setup: Authenticated User A, User B, and Station Operator', !!tokenA && !!tokenB && !!tokenOp);

  // 2. Create a test station with 5 chargers (KG1, KG2, KG3, KG4, KG5)
  const stationPayload = {
    name: `VoltSync Cinema Hub ${stamp}`,
    latitude: 19.0760,
    longitude: 72.8777,
    connectorTypes: ['CCS'],
    chargingSpeedKw: 60,
    pricingPerKwh: 16,
    chargerCount: 5
  };
  const resStation = await api('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenOp}` },
    body: JSON.stringify(stationPayload)
  });

  const station = await Station.findById(resStation.body?._id);
  // Rename chargers to KG1, KG2, KG3, KG4, KG5 for exact prompt alignment
  station.chargers = [
    { id: 'KG1', status: 'free' },
    { id: 'KG2', status: 'free' },
    { id: 'KG3', status: 'free' },
    { id: 'KG4', status: 'free' },
    { id: 'KG5', status: 'free' }
  ];
  await station.save();
  const stationId = station._id.toString();

  assert('Setup: Created test station with KG1..KG5 chargers', station.chargers.length === 5);

  // Base future slot times within the upcoming 8-hour window
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

  const slot10 = new Date(currentHour.getTime() + 2 * 60 * 60 * 1000);
  const slot10ISO = slot10.toISOString();

  const slot11 = new Date(currentHour.getTime() + 3 * 60 * 60 * 1000);
  const slot11ISO = slot11.toISOString();

  // ----------------------------------------------------
  // TEST A: Book KG1 at 10:00–11:00.
  // Expected: KG1 at 10:00–11:00 = unavailable, KG1 at 11:00–12:00 = available.
  // ----------------------------------------------------
  console.log('\n--- Running TEST A: Time isolation per charger ---');
  const lockA10 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ stationId, chargerId: 'KG1', slotTime: slot10ISO })
  });
  assert('Lock KG1 at 10:00 succeeds (201)', lockA10.status === 201);
  const bookingIdA10 = lockA10.body?.bookingId;

  // Confirm via demo-pay
  const payA10 = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ bookingId: bookingIdA10, energyKwh: 15 })
  });
  assert('Confirm booking for KG1 at 10:00 succeeds (200)', payA10.status === 200);

  // Check availability
  const resAvailA = await api(`/stations/${stationId}/availability`);
  const slot10Data = resAvailA.body?.slots?.find(s => new Date(s.slotTime).getTime() === slot10.getTime());
  const slot11Data = resAvailA.body?.slots?.find(s => new Date(s.slotTime).getTime() === slot11.getTime());

  const kg1Slot10 = slot10Data?.chargers?.find(c => c.id === 'KG1');
  const kg1Slot11 = slot11Data?.chargers?.find(c => c.id === 'KG1');

  assert('TEST A.1: KG1 at 10:00-11:00 is BOOKED', kg1Slot10?.status === 'BOOKED');
  assert('TEST A.2: KG1 at 11:00-12:00 is AVAILABLE', kg1Slot11?.status === 'AVAILABLE');

  // User B can lock KG1 at 11:00
  const lockB11 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ stationId, chargerId: 'KG1', slotTime: slot11ISO })
  });
  assert('TEST A.3: User B successfully locks KG1 at 11:00 (201)', lockB11.status === 201);
  // Release hold for clean slate on slot11
  await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ bookingId: lockB11.body?.bookingId })
  });

  // ----------------------------------------------------
  // TEST B: Hold KG1 at 10:00–11:00. Second user attempts same charger/time.
  // Expected: 409 Conflict.
  // ----------------------------------------------------
  console.log('\n--- Running TEST B: Hold collision protection ---');
  // First user B attempts to hold KG1 at 10:00 which is already booked
  const collideB10 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ stationId, chargerId: 'KG1', slotTime: slot10ISO })
  });
  assert('TEST B.1: Second user attempting booked KG1 at 10:00 gets 409 Conflict', collideB10.status === 409);
  assert(
    'TEST B.2: Conflict message informs charger is reserved',
    collideB10.body?.error === 'This charger has just been reserved. Please select another charger.'
  );

  // Now test with an active hold (unconfirmed):
  // User B holds KG3 at 11:00
  const holdB11 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ stationId, chargerId: 'KG3', slotTime: slot11ISO })
  });
  assert('User B holds KG3 at 11:00 (201)', holdB11.status === 201);

  // User A attempts to hold KG3 at 11:00
  const collideA11 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ stationId, chargerId: 'KG3', slotTime: slot11ISO })
  });
  assert('TEST B.3: Second user attempting held KG3 at 11:00 gets 409 Conflict', collideA11.status === 409);

  // ----------------------------------------------------
  // TEST C: Hold expires. Second user attempts same charger/time.
  // Expected: success (201).
  // ----------------------------------------------------
  console.log('\n--- Running TEST C: Hold expiration frees slot ---');
  // Manually backdate User B's hold on KG3 to the past
  await Booking.updateOne(
    { _id: holdB11.body?.bookingId },
    { lockedUntil: new Date(Date.now() - 1000) }
  );

  // User A now attempts to hold KG3 at 11:00
  const lockAExpiredHold = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ stationId, chargerId: 'KG3', slotTime: slot11ISO })
  });
  assert('TEST C: Expired hold on KG3 allows new reservation by User A (201)', lockAExpiredHold.status === 201);
  // Release User A's hold
  await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ bookingId: lockAExpiredHold.body?.bookingId })
  });

  // ----------------------------------------------------
  // TEST D: Confirm KG1 at 10:00–11:00. Another user can still book KG2 at 10:00–11:00.
  // ----------------------------------------------------
  console.log('\n--- Running TEST D: Independent chargers at same slot ---');
  // User A already has confirmed KG1 at 10:00.
  // User B books KG2 at 10:00.
  const lockB_KG2 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ stationId, chargerId: 'KG2', slotTime: slot10ISO })
  });
  assert('TEST D.1: User B can book KG2 at 10:00 while KG1 is booked (201)', lockB_KG2.status === 201);

  const payB_KG2 = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ bookingId: lockB_KG2.body?.bookingId, energyKwh: 20 })
  });
  assert('TEST D.2: User B confirms KG2 at 10:00 (200)', payB_KG2.status === 200);

  // ----------------------------------------------------
  // TEST E: Same user already has KG1 at 10:00–11:00.
  // Same user attempts KG2 at 10:00–11:00.
  // Expected: 409 Conflict ("You already have a reservation during this time slot.").
  // ----------------------------------------------------
  console.log('\n--- Running TEST E: Same-user overlapping booking prevention ---');
  // User A already has KG1 at 10:00. User A attempts to reserve KG4 at 10:00.
  const userAOverlap = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ stationId, chargerId: 'KG4', slotTime: slot10ISO })
  });
  assert('TEST E.1: Same user attempting 2nd charger in same slot is rejected with 409', userAOverlap.status === 409);
  assert(
    'TEST E.2: Error message is "You already have a reservation during this time slot."',
    userAOverlap.body?.error === 'You already have a reservation during this time slot.'
  );

  // ----------------------------------------------------
  // TEST F: Booking finishes.
  // Expected: booking remains in history as completed, future/non-overlapping slots are available.
  // ----------------------------------------------------
  console.log('\n--- Running TEST F: Completed session lifecycle & history ---');
  // Create a past booking for User A (e.g. 2 hours ago)
  const pastSlot = new Date(Date.now() - 2 * 60 * 60 * 1000);
  pastSlot.setMinutes(0, 0, 0);

  const pastBooking = new Booking({
    stationId,
    chargerId: 'KG1',
    slotTime: pastSlot,
    status: 'confirmed',
    active: true,
    userEmail: userAEmail.toLowerCase(),
    bookingReference: `VS-HIST-${Date.now()}`,
    checkInCode: `VP-HIST-${Date.now()}`,
    amountPaid: 300
  });
  await pastBooking.save();

  // Call user history
  const historyRes = await api('/bookings/my-bookings', {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert('GET /my-bookings returns 200', historyRes.status === 200);

  const foundCompleted = historyRes.body?.find(b => b.bookingReference === pastBooking.bookingReference);
  assert('TEST F.1: Past booking remains in Booking History', !!foundCompleted);
  assert('TEST F.2: Past booking transitioned to completed status', foundCompleted?.status === 'completed');
  assert('TEST F.3: Past booking has active: false', foundCompleted?.active === false);

  // Verify that completed booking does not block KG1 for upcoming slot11
  const lockKG1AfterComplete = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ stationId, chargerId: 'KG1', slotTime: slot11ISO })
  });
  assert('TEST F.4: Completed booking does not block KG1 in subsequent slot (201)', lockKG1AfterComplete.status === 201);
  // Release hold
  await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ bookingId: lockKG1AfterComplete.body?.bookingId })
  });

  // ----------------------------------------------------
  // TEST G: Cancel future booking.
  // Expected: that exact charger/time becomes available again.
  // ----------------------------------------------------
  console.log('\n--- Running TEST G: Cancellation reopens exact slot ---');
  // User B currently has confirmed KG2 at 10:00 (payB_KG2)
  const cancelRes = await api('/bookings/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ bookingId: lockB_KG2.body?.bookingId })
  });
  assert('TEST G.1: User B cancels confirmed KG2 at 10:00 (200)', cancelRes.status === 200);

  // Now KG2 at 10:00 should be AVAILABLE again.
  // Another user (or User B now that their previous reservation is cancelled) can reserve KG2 at 10:00.
  const rebookKG2 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ stationId, chargerId: 'KG2', slotTime: slot10ISO })
  });
  assert('TEST G.2: Cancelled charger KG2 at 10:00 is immediately bookable again (201)', rebookKG2.status === 201);
  await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ bookingId: rebookKG2.body?.bookingId })
  });

  // ----------------------------------------------------
  // TEST H: Concurrent lock requests for same charger/time.
  // Expected: exactly one success (201), one conflict (409).
  // ----------------------------------------------------
  console.log('\n--- Running TEST H: Concurrent race condition test ---');
  // Create two distinct users for concurrency
  const userC = `userC_race_${stamp}@test.com`;
  const userD = `userD_race_${stamp}@test.com`;
  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'User C', email: userC, password: 'SecurePassword123!' })
  });
  const resC = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: userC, password: 'SecurePassword123!' })
  });
  const tokenC = resC.body?.token;

  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'User D', email: userD, password: 'SecurePassword123!' })
  });
  const resD = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: userD, password: 'SecurePassword123!' })
  });
  const tokenD = resD.body?.token;

  // Race to lock KG5 at 11:00
  const [race1, race2] = await Promise.all([
    api('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenC}` },
      body: JSON.stringify({ stationId, chargerId: 'KG5', slotTime: slot11ISO })
    }),
    api('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenD}` },
      body: JSON.stringify({ stationId, chargerId: 'KG5', slotTime: slot11ISO })
    })
  ]);

  const raceStatuses = [race1.status, race2.status].sort();
  assert(
    'TEST H.1: Exactly one concurrent lock succeeds (201) and one conflicts (409)',
    raceStatuses[0] === 201 && raceStatuses[1] === 409
  );

  const conflictRes = race1.status === 409 ? race1 : race2;
  assert(
    'TEST H.2: Conflicted request receives exact error message',
    conflictRes.body?.error === 'This charger has just been reserved. Please select another charger.'
  );

  console.log('\n------------------------------------------------------');
  console.log(`Cinema Booking Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------\n');

  // Cleanup test station and created bookings
  await Booking.deleteMany({ stationId });
  await Station.deleteOne({ _id: stationId });
  await User.deleteMany({ email: { $in: [userAEmail, userBEmail, opEmail, userC, userD] } });

  server.close();
  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
