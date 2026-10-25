/**
 * VoltSync Full-Stack Comprehensive Integration Test Suite
 * Tests all requirements across Phases 1 to 6 & 9.
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

function assert(title, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${title}`);
  } else {
    failed++;
    console.error(`  FAIL: ${title} ${extra ? '— ' + extra : ''}`);
  }
}

async function api(path, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) }
  });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body, headers: res.headers };
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`   VoltSync Comprehensive End-to-End Test Suite`);
  console.log(`   Target: ${API_BASE}`);
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

  // 1. Database Health Check
  const rootHealthRes = await fetch('http://localhost:5000/health').then(r => r.json());
  assert('System /health endpoint is operational', rootHealthRes.status === 'ok');

  const apiHealthRes = await fetch('http://localhost:5000/api/health').then(r => r.json());
  assert(
    'Database readiness /api/health reports connected state',
    apiHealthRes.database === 'connected',
    JSON.stringify(apiHealthRes)
  );

  // 2. Authentication & Public Signup Restriction
  const driverEmail = `e2e_driver_${stamp}@test.com`;
  const op1Email = `e2e_op1_${stamp}@test.com`;
  const op2Email = `e2e_op2_${stamp}@test.com`;
  const password = 'SecurePass123!';

  // Attempt to signup with operator role -> must be forced to driver
  const signupDriver = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E Driver', email: driverEmail, password, role: 'operator' })
  });
  assert('Public signup enforces driver role regardless of role payload', signupDriver.status === 201 && signupDriver.body.user.role === 'driver');
  const driverToken = signupDriver.body.token;

  // Weak password rejection
  const weakSignup = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Weak', email: `weak_${stamp}@test.com`, password: 'weak' })
  });
  assert('Weak password rejected on signup (400)', weakSignup.status === 400);

  // Sign up Op1 and Op2
  await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name: 'Operator 1', email: op1Email, password }) });
  await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name: 'Operator 2', email: op2Email, password }) });

  // Promote Op1 and Op2 via User model directly in DB
  await User.updateOne({ email: op1Email }, { $set: { role: 'operator' } });
  await User.updateOne({ email: op2Email }, { $set: { role: 'operator' } });

  const op1Login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: op1Email, password }) });
  const op2Login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: op2Email, password }) });
  const op1Token = op1Login.body?.token;
  const op2Token = op2Login.body?.token;
  assert('Operator 1 authenticated with operator role', op1Login.body?.user?.role === 'operator');
  assert('Operator 2 authenticated with operator role', op2Login.body?.user?.role === 'operator');

  // 3. Driver denial of operator actions
  const driverCreateStation = await api('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ name: 'Driver Station', latitude: 21.17, longitude: 72.83, chargerCount: 2, connectorTypes: ['CCS'], chargingSpeedKw: 50, pricingPerKwh: 15 })
  });
  assert('Driver denied from creating stations (403)', driverCreateStation.status === 403);

  // 4. Operator 1 creates a station
  const op1CreateStation = await api('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${op1Token}` },
    body: JSON.stringify({ name: `Op1 Hub ${stamp}`, latitude: 21.18, longitude: 72.82, chargerCount: 3, connectorTypes: ['CCS', 'Type 2'], chargingSpeedKw: 120, pricingPerKwh: 16 })
  });
  assert('Operator 1 successfully registers new charging station (201)', op1CreateStation.status === 201);
  const op1StationId = op1CreateStation.body?._id;
  const op1ChargerId = op1CreateStation.body?.chargers?.[0]?.id;

  // 5. Cross-operator ownership enforcement
  // Operator 2 attempts to change charger status on Operator 1's station
  const op2TamperCharger = await api(`/stations/${op1StationId}/charger-status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${op2Token}` },
    body: JSON.stringify({ chargerId: op1ChargerId, status: 'maintenance' })
  });
  assert('Cross-operator action rejected: Op2 cannot modify Op1 station charger (403)', op2TamperCharger.status === 403);

  // Op2 attempts to edit Op1 station pricing
  const op2TamperPricing = await api(`/stations/${op1StationId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${op2Token}` },
    body: JSON.stringify({ pricingPerKwh: 99 })
  });
  assert('Cross-operator action rejected: Op2 cannot edit Op1 station parameters (403)', op2TamperPricing.status === 403);

  // Op1 successfully modifies own charger status
  const op1UpdateCharger = await api(`/stations/${op1StationId}/charger-status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${op1Token}` },
    body: JSON.stringify({ chargerId: op1ChargerId, status: 'free' })
  });
  assert('Owner operator can modify charger status (200)', op1UpdateCharger.status === 200);

  // 6. Empty station searches making NO database writes
  const stationCountBefore = await Station.countDocuments();
  const emptySearchRes = await api('/stations/nearby?lat=0.0001&lng=0.0001&radius=5');
  assert('Search in empty ocean coordinates returns 0 stations', emptySearchRes.status === 200 && emptySearchRes.body.totalStations === 0);
  const stationCountAfter = await Station.countDocuments();
  assert('Empty search does NOT create fictional stations in DB', stationCountBefore === stationCountAfter);

  // 7. Concurrent booking attempts: exactly one successful hold for same charger/slot
  const slotDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
  slotDate.setMinutes(0, 0, 0);
  const slotTimeISO = slotDate.toISOString();

  // Create another driver for race condition test
  const driver2Email = `e2e_driver2_${stamp}@test.com`;
  const signupDriver2 = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E Driver 2', email: driver2Email, password })
  });
  const driver2Token = signupDriver2.body.token;

  const [race1, race2] = await Promise.all([
    api('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ stationId: op1StationId, chargerId: op1ChargerId, slotTime: slotTimeISO })
    }),
    api('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driver2Token}` },
      body: JSON.stringify({ stationId: op1StationId, chargerId: op1ChargerId, slotTime: slotTimeISO })
    })
  ]);

  const raceStatuses = [race1.status, race2.status].sort();
  assert(
    'Concurrent booking attempt: exactly one succeeds (201) and one conflicts (409)',
    raceStatuses[0] === 201 && raceStatuses[1] === 409
  );

  const winningBookingId = race1.status === 201 ? race1.body.bookingId : race2.body.bookingId;
  const winningToken = race1.status === 201 ? driverToken : driver2Token;

  // 8. Invalid booking requests
  // Past time slot
  const pastLock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ stationId: op1StationId, slotTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() })
  });
  assert('Reject past slot time booking (400)', pastLock.status === 400);

  // Invalid charger ID
  const invalidChargerLock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ stationId: op1StationId, chargerId: 'NON_EXISTENT_CHARGER', slotTime: slotTimeISO })
  });
  assert('Reject non-existent charger ID (404)', invalidChargerLock.status === 404);

  // 9. Payment verification: Order creation & signature verification
  const orderRes = await api('/payments/create-order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${winningToken}` },
    body: JSON.stringify({ bookingId: winningBookingId, energyKwh: 20 })
  });
  assert('Payment order created successfully with server breakdown', orderRes.status === 200 && !!orderRes.body.orderId);
  const orderId = orderRes.body?.orderId;

  // Verify payment
  const verifyRes = await api('/payments/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${winningToken}` },
    body: JSON.stringify({
      bookingId: winningBookingId,
      orderId,
      paymentId: `pay_e2e_${Date.now()}`,
      signature: 'test_sandbox_sig'
    })
  });
  assert('Payment verified and booking confirmed', verifyRes.status === 200 && verifyRes.body.booking.status === 'confirmed');
  const checkInCode = verifyRes.body?.receipt?.checkInCode;
  assert('Verifiable check-in code generated on receipt', !!checkInCode && checkInCode.startsWith('VP-'));

  // 10. Cancellation without corrupting physical charger status
  // Check physical charger status before cancellation
  const stationBeforeCancel = await Station.findById(op1StationId);
  const chargerBeforeStatus = stationBeforeCancel.chargers.find(c => c.id === op1ChargerId).status;

  const cancelRes = await api('/bookings/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${winningToken}` },
    body: JSON.stringify({ bookingId: winningBookingId })
  });
  assert('Confirmed booking cancelled by user', cancelRes.status === 200);

  const stationAfterCancel = await Station.findById(op1StationId);
  const chargerAfterStatus = stationAfterCancel.chargers.find(c => c.id === op1ChargerId).status;
  assert('Future booking cancellation does NOT mutate physical charger status', chargerBeforeStatus === chargerAfterStatus);

  // 11. FastPass QR check-in workflow
  // Create and confirm a fresh booking for check-in test
  const checkInSlotDate = new Date(Date.now() + 5 * 60 * 60 * 1000);
  checkInSlotDate.setMinutes(0, 0, 0);

  const freshLock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ stationId: op1StationId, chargerId: 'C2', slotTime: checkInSlotDate.toISOString() })
  });
  const freshBookingId = freshLock.body?.bookingId;

  const freshOrder = await api('/payments/create-order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ bookingId: freshBookingId, energyKwh: 15 })
  });

  const freshVerify = await api('/payments/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      bookingId: freshBookingId,
      orderId: freshOrder.body?.orderId,
      paymentId: `pay_chk_${Date.now()}`
    })
  });
  const freshCheckInCode = freshVerify.body?.receipt?.checkInCode;

  // Op2 attempts check-in on Op1's station pass -> forbidden
  const op2CheckIn = await api('/bookings/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${op2Token}` },
    body: JSON.stringify({ checkInCode: freshCheckInCode })
  });
  assert('Operator 2 cannot check in driver at Operator 1 station (403)', op2CheckIn.status === 403);

  // Op1 checks in driver -> succeeds
  const op1CheckIn = await api('/bookings/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${op1Token}` },
    body: JSON.stringify({ checkInCode: freshCheckInCode })
  });
  assert('Authorized station operator validates driver check-in pass (200)', op1CheckIn.status === 200 && op1CheckIn.body.success === true);

  // Repeated check-in with same pass -> rejected
  const repeatCheckIn = await api('/bookings/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${op1Token}` },
    body: JSON.stringify({ checkInCode: freshCheckInCode })
  });
  assert('Reused check-in pass is rejected (400)', repeatCheckIn.status === 400);

  // 12. Operator Analytics scoped to owned stations
  const op1Analytics = await api('/stations/operator/analytics', {
    headers: { Authorization: `Bearer ${op1Token}` }
  });
  assert('Operator 1 analytics returns scoped report', op1Analytics.status === 200 && Array.isArray(op1Analytics.body.stationAnalytics));

  console.log(`\n------------------------------------------------------`);
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`------------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
