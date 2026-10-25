/**
 * VoltSync Lock CTA & Existing Hold UX Targeted Test Suite
 * Tests all required cases:
 * TEST 1: Valid free charger selected -> 201 Created with server lockedUntil
 * TEST 2: Same user already owns unexpired hold -> 409 with existingHold metadata
 * TEST 3: Same user owns confirmed booking -> 409 without existingHold (confirmed conflict)
 * TEST 4: Another user holds selected charger -> 409 without existingHold
 * TEST 5: Expired/Missing JWT -> 401 Unauthorized
 * TEST 6: Release existing hold -> 200, charger becomes available, allows new selection
 * TEST 7: Original lockedUntil preserved on existing hold (does NOT reset to 5 minutes)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Station = require('../models/Station');
const Booking = require('../models/Booking');
const User = require('../models/User');

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';
const stamp = Date.now();

let passed = 0;
let failed = 0;

function assert(tag, title, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  [${tag}] PASS: ${title}`);
  } else {
    failed++;
    console.error(`  [${tag}] FAIL: ${title} ${extra ? '— ' + extra : ''}`);
  }
}

async function api(pathUrl, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(`${API_BASE}${pathUrl}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) }
  });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body, headers: res.headers };
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`   VoltSync Lock CTA & Existing Hold UX Test Suite`);
  console.log(`   API Target: ${API_BASE}`);
  console.log(`======================================================\n`);

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ev_charging';
  await mongoose.connect(mongoUri);

  let localServer = null;
  try {
    await fetch('http://localhost:5000/health', { signal: AbortSignal.timeout(800) });
  } catch (e) {
    const app = require('../server');
    localServer = app.listen(5000);
    await new Promise((r) => setTimeout(r, 600));
  }

  // Create test drivers
  const driver1Email = `lock_driver1_${stamp}@ux.com`;
  const driver2Email = `lock_driver2_${stamp}@ux.com`;
  const password = 'Password123!';

  const signup1 = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'UX Driver 1', email: driver1Email, password })
  });
  const token1 = signup1.body?.token;

  const signup2 = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'UX Driver 2', email: driver2Email, password })
  });
  const token2 = signup2.body?.token;

  // Create test station
  const testStation = await Station.create({
    name: `UX Station ${stamp}`,
    location: { type: 'Point', coordinates: [72.82, 21.18] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 16,
    operatorId: signup1.body?.user?.id || signup1.body?.user?._id,
    chargers: [
      { id: 'RR1', status: 'free' },
      { id: 'RR6', status: 'free' },
      { id: 'RR3', status: 'free' }
    ]
  });

  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const slotTime = new Date(currentHour.getTime() + 2 * 3600000).toISOString();

  // TEST 1: Valid free charger selected -> 201 Created with server lockedUntil
  const lockRes1 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR6',
      slotTime,
      energyKwh: 20
    })
  });
  assert('TEST 1', 'Valid free charger lock returns 201 with server lockedUntil', lockRes1.status === 201 && !!lockRes1.body?.lockedUntil && lockRes1.body?.chargerId === 'RR6');
  const hold1BookingId = lockRes1.body?.bookingId;
  const originalLockedUntil = lockRes1.body?.lockedUntil;

  // TEST 2: Same user attempts another lock (or same) -> 409 with existingHold metadata
  const lockRes2 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR1',
      slotTime,
      energyKwh: 20
    })
  });
  assert(
    'TEST 2.1',
    'Same user holding RR6 attempting RR1 receives 409 with existingHold metadata',
    lockRes2.status === 409 && !!lockRes2.body?.existingHold && lockRes2.body?.existingHold?.chargerId === 'RR6'
  );
  assert(
    'TEST 2.2',
    'existingHold contains original server lockedUntil',
    lockRes2.body?.existingHold?.lockedUntil === originalLockedUntil
  );

  // TEST 3: Same user owns confirmed booking -> 409 WITHOUT existingHold
  // Confirm hold1 via demo-pay
  const payRes = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ bookingId: hold1BookingId })
  });
  assert('SETUP TEST 3', 'Payment confirmed booking for RR6', payRes.status === 200);

  const lockRes3 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR1',
      slotTime,
      energyKwh: 20
    })
  });
  assert(
    'TEST 3',
    'Same user with confirmed booking receives 409 conflict WITHOUT existingHold (no continue checkout option)',
    lockRes3.status === 409 && !lockRes3.body?.existingHold && lockRes3.body?.error === 'You already have a reservation during this time slot.'
  );

  // Release/cancel confirmed booking so we can test Driver 2
  await api('/bookings/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ bookingId: hold1BookingId })
  });

  // TEST 4: Another user holds selected charger -> 409 without existingHold (never leak to other users)
  // Driver 2 locks RR6
  const driver2Lock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR6',
      slotTime,
      energyKwh: 20
    })
  });
  assert('SETUP TEST 4', 'Driver 2 locks RR6', driver2Lock.status === 201);

  // Driver 1 attempts to lock RR6 (held by Driver 2)
  const driver1LockContested = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR6',
      slotTime,
      energyKwh: 20
    })
  });
  assert(
    'TEST 4',
    'Driver 1 receives 409 conflict and NO existingHold (another user hold is never leaked)',
    driver1LockContested.status === 409 && !driver1LockContested.body?.existingHold && driver1LockContested.body?.error === 'This charger has just been reserved. Please select another charger.'
  );

  // TEST 5: Expired / Missing JWT -> 401 Unauthorized
  const unauthLock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: 'Bearer invalid.expired.token' },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR1',
      slotTime,
      energyKwh: 20
    })
  });
  assert('TEST 5', 'Unauthenticated/expired token returns 401', unauthLock.status === 401);

  // TEST 6: Release existing hold -> 200, charger becomes available, allows new selection
  // Driver 2 holds RR6. Driver 2 decides to release RR6 and switch to RR1
  const releaseRes = await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ bookingId: driver2Lock.body?.bookingId })
  });
  assert('TEST 6.1', 'Driver 2 releases existing hold on RR6 (200)', releaseRes.status === 200);

  // Now Driver 2 can lock RR1
  const lockRR1 = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR1',
      slotTime,
      energyKwh: 20
    })
  });
  assert('TEST 6.2', 'Driver 2 can successfully lock RR1 after releasing RR6 (201)', lockRR1.status === 201 && lockRR1.body?.chargerId === 'RR1');

  // TEST 7: Original lockedUntil preserved on existing hold (does NOT reset to 5 minutes)
  // Simulate an hold created 3 minutes ago (with ~2 minutes remaining)
  const remainingTimeTargetMs = 120 * 1000; // 2 minutes remaining
  const partialHold = await Booking.create({
    bookingReference: `VS-PARTIAL-${stamp}`,
    userEmail: driver1Email,
    stationId: testStation._id,
    chargerId: 'RR3',
    slotTime: new Date(slotTime),
    slotDurationMinutes: 60,
    status: 'locked',
    lockedUntil: new Date(Date.now() + remainingTimeTargetMs),
    active: true,
    energyKwh: 20,
    amountDue: 320,
    checkInCode: `VP-PARTIAL-${stamp.toString().slice(-4)}`
  });

  const queryPartialHold = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'RR3',
      slotTime,
      energyKwh: 20
    })
  });

  const returnedLockedUntil = new Date(queryPartialHold.body?.existingHold?.lockedUntil).getTime();
  const diffFromTarget = Math.abs(returnedLockedUntil - partialHold.lockedUntil.getTime());
  assert(
    'TEST 7',
    'Existing hold returns original lockedUntil (~2 mins remaining) and does NOT reset to 5 minutes',
    queryPartialHold.status === 409 && diffFromTarget < 2000
  );

  // Clean up test data
  await Booking.deleteMany({ stationId: testStation._id });
  await Station.deleteOne({ _id: testStation._id });
  await User.deleteMany({ email: { $in: [driver1Email, driver2Email] } });

  console.log(`\n======================================================`);
  console.log(`   Lock UX Test Suite Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (localServer) localServer.close();
  await mongoose.disconnect();

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Lock UX Test Suite Error:', err);
  process.exit(1);
});
