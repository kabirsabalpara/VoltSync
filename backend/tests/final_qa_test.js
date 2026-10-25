/**
 * VoltSync Final Targeted QA & Fixes Test Suite
 * Explicitly tests Requirements A through U
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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
    console.log(`  [TEST ${tag}] PASS: ${title}`);
  } else {
    failed++;
    console.error(`  [TEST ${tag}] FAIL: ${title} ${extra ? '— ' + extra : ''}`);
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

function getChargerStatus(availRes, slotTimeISO, chargerId) {
  const slot = availRes.body?.slots?.find(s => s.slotTime === slotTimeISO);
  return slot?.chargers?.find(c => c.id === chargerId)?.status;
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`   VoltSync Final Targeted QA Test Suite (A to U)`);
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

  // TEST A: EV models remain six valid values
  const authModalPath = path.resolve(__dirname, '../../frontend/src/components/AuthModal.jsx');
  const authModalSrc = fs.readFileSync(authModalPath, 'utf8');
  const expectedModels = [
    'Tata Nexon EV Max',
    'MG ZS EV Long Range',
    'Hyundai Ioniq 5 Ultra',
    'BYD Atto 3 Superior',
    'Mahindra XUV400 EL',
    'Other / Generic EV'
  ];
  const allModelsFound = expectedModels.every(m => authModalSrc.includes(m));
  assert('A', 'EV models in signup dropdown contain all six exact valid values', allModelsFound);

  // TEST B: Public signup creates Driver only
  const publicEmail = `test_driver_${stamp}@qa.com`;
  const signupRes = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA Driver',
      email: publicEmail,
      password: 'Password123!',
      role: 'operator', // Attempt privilege escalation
      evModel: 'Tata Nexon EV Max'
    })
  });
  assert(
    'B',
    'Public signup creates Driver only (operator role payload ignored)',
    signupRes.status === 201 && signupRes.body?.user?.role === 'driver',
    `status=${signupRes.status}, role=${signupRes.body?.user?.role}`
  );
  const driverToken = signupRes.body.token;
  const driverUserId = signupRes.body.user.id || signupRes.body.user._id;

  // TEST C: Demo controls absent in production build / default
  const envExamplePath = path.resolve(__dirname, '../../frontend/.env.example');
  const envExampleSrc = fs.readFileSync(envExamplePath, 'utf8');
  const demoDisabledByDefault = envExampleSrc.includes('VITE_ENABLE_DEMO_LOGIN=false') &&
    authModalSrc.includes("import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true'");
  assert('C', 'Demo login quick shortcuts gated behind VITE_ENABLE_DEMO_LOGIN === "true"', demoDisabledByDefault);

  // Setup Test Station & Operators for Cinema Booking Tests
  const hashedPassword = await bcrypt.hash('Password123!', 10);
  const op1 = await User.create({
    name: 'QA Station Operator 1',
    email: `op1_${stamp}@qa.com`,
    password: hashedPassword,
    role: 'operator'
  });
  const op2 = await User.create({
    name: 'QA Station Operator 2',
    email: `op2_${stamp}@qa.com`,
    password: hashedPassword,
    role: 'operator'
  });

  const testStation = await Station.create({
    name: `QA Final Cinema Station ${stamp}`,
    location: {
      type: 'Point',
      coordinates: [72.825, 21.185]
    },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    operatorId: op1._id,
    chargers: [
      { id: 'CH-A', status: 'free' },
      { id: 'CH-B', status: 'free' },
      { id: 'CH-C', status: 'maintenance' }
    ]
  });

  // Second station for op2
  const op2Station = await Station.create({
    name: `QA Second Station ${stamp}`,
    location: {
      type: 'Point',
      coordinates: [72.830, 21.190]
    },
    connectorTypes: ['CCS'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    operatorId: op2._id,
    chargers: [
      { id: 'CH-X', status: 'free' }
    ]
  });

  // Helper login for op1
  const op1Login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: `op1_${stamp}@qa.com`, password: 'Password123!' })
  });
  const op1Token = op1Login.body?.token;

  // Helper login for op2
  const op2Login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: `op2_${stamp}@qa.com`, password: 'Password123!' })
  });
  const op2Token = op2Login.body?.token;

  // Another driver
  const driver2Email = `driver2_${stamp}@qa.com`;
  const driver2Signup = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA Driver Two',
      email: driver2Email,
      password: 'Password123!'
    })
  });
  const driver2Token = driver2Signup.body.token;

  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const testSlotTime = new Date(currentHour.getTime() + 2 * 3600000).toISOString();
  const testSlotNext = new Date(currentHour.getTime() + 3 * 3600000).toISOString();

  // TEST D: User selects explicit charger and lock request contains chargerId
  const lockD = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'CH-A',
      slotTime: testSlotTime,
      energyKwh: 25
    })
  });
  assert(
    'D',
    'User selects explicit charger and lock request assigns specified chargerId',
    lockD.status === 201 && lockD.body?.chargerId === 'CH-A' && !!lockD.body?.lockedUntil,
    `status=${lockD.status}, chargerId=${lockD.body?.chargerId}`
  );
  const bookingDId = lockD.body?.bookingId || lockD.body?._id;

  // Release booking D to reset clean state for Race test
  const relD = await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ bookingId: bookingDId })
  });

  // TEST E: Two users race for same charger/time: exactly one success
  const [raceRes1, raceRes2] = await Promise.all([
    api('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({
        stationId: testStation._id.toString(),
        chargerId: 'CH-A',
        slotTime: testSlotTime,
        energyKwh: 20
      })
    }),
    api('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driver2Token}` },
      body: JSON.stringify({
        stationId: testStation._id.toString(),
        chargerId: 'CH-A',
        slotTime: testSlotTime,
        energyKwh: 20
      })
    })
  ]);

  const raceSuccesses = [raceRes1, raceRes2].filter(r => r.status === 201).length;
  const raceConflicts = [raceRes1, raceRes2].filter(r => r.status === 409).length;
  assert('E', 'Two users race for same charger/time: exactly one success and one 409 conflict', raceSuccesses === 1 && raceConflicts === 1, `successes=${raceSuccesses}, conflicts=${raceConflicts}`);

  const activeRaceBooking = raceRes1.status === 201 ? raceRes1.body : raceRes2.body;
  const activeDriverToken = raceRes1.status === 201 ? driverToken : driver2Token;
  const otherDriverToken = raceRes1.status === 201 ? driver2Token : driverToken;

  // TEST F: Two users book different chargers for same time: both allowed
  const secondChargerLock = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${otherDriverToken}` },
    body: JSON.stringify({
      stationId: testStation._id.toString(),
      chargerId: 'CH-B',
      slotTime: testSlotTime,
      energyKwh: 15
    })
  });
  assert('F', 'Two users book different chargers for same time: both allowed', secondChargerLock.status === 201 && secondChargerLock.body?.chargerId === 'CH-B');

  // TEST G: Same user attempts two chargers at same time: second receives 409
  // activeDriver already holds CH-A at testSlotTime; attempts to lock CH-B or another station at testSlotTime
  const sameUserOverlap = await api('/bookings/lock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeDriverToken}` },
    body: JSON.stringify({
      stationId: op2Station._id.toString(),
      chargerId: 'CH-X',
      slotTime: testSlotTime,
      energyKwh: 15
    })
  });
  assert(
    'G',
    'Same user attempts two chargers at same time: second receives 409 with overlapping reservation error',
    sameUserOverlap.status === 409 && sameUserOverlap.body?.error === 'You already have a reservation during this time slot.',
    `status=${sameUserOverlap.status}, error=${sameUserOverlap.body?.error}`
  );

  // Clean up secondChargerLock to free CH-B
  if (secondChargerLock.status === 201) {
    await api('/bookings/release', {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherDriverToken}` },
      body: JSON.stringify({ bookingId: secondChargerLock.body.bookingId || secondChargerLock.body._id })
    });
  }

  // TEST H: locked booking expires after lockedUntil
  // Create an expired locked booking directly in DB for testing
  const expiredHoldBooking = await Booking.create({
    bookingReference: `VS-EXPHOLD-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'locked',
    lockedUntil: new Date(Date.now() - 10000), // 10s in past
    active: true,
    energyKwh: 20,
    amountDue: 300,
    checkInCode: 'VP-EXPHOLD'
  });

  // Call availability which triggers updateBookingLifecycle
  await api(`/stations/${testStation._id}/availability`);
  const refreshedH = await Booking.findById(expiredHoldBooking._id);
  assert('H', 'locked booking expires after lockedUntil (status becomes expired, active=false)', refreshedH.status === 'expired' && refreshedH.active === false);

  // TEST I: payment_pending booking also expires after lockedUntil
  const paymentPendingBooking = await Booking.create({
    bookingReference: `VS-EXPPAY-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'payment_pending',
    paymentStatus: 'pending',
    lockedUntil: new Date(Date.now() - 10000), // Expired hold
    active: true,
    energyKwh: 20,
    amountDue: 300,
    checkInCode: 'VP-EXPPAY'
  });

  await api(`/stations/${testStation._id}/availability`);
  const refreshedI = await Booking.findById(paymentPendingBooking._id);
  assert('I', 'payment_pending booking also expires after lockedUntil (status becomes expired, active=false, paymentStatus=failed)', refreshedI.status === 'expired' && refreshedI.active === false && refreshedI.paymentStatus === 'failed');

  // TEST J: availability shows unexpired payment_pending charger as HELD
  const activePendingBooking = await Booking.create({
    bookingReference: `VS-VALPEND-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'payment_pending',
    paymentStatus: 'pending',
    lockedUntil: new Date(Date.now() + 300000), // Valid 5 mins
    active: true,
    energyKwh: 20,
    amountDue: 300,
    checkInCode: 'VP-VALPEND'
  });

  const availJ = await api(`/stations/${testStation._id}/availability`);
  const chargerBStatusJ = getChargerStatus(availJ, testSlotTime, 'CH-B');
  assert('J', 'availability shows unexpired payment_pending charger as HELD', chargerBStatusJ === 'HELD', `status=${chargerBStatusJ}`);

  // TEST K: expired payment_pending charger becomes AVAILABLE
  activePendingBooking.lockedUntil = new Date(Date.now() - 10000);
  await activePendingBooking.save();

  const availK = await api(`/stations/${testStation._id}/availability`);
  const chargerBStatusK = getChargerStatus(availK, testSlotTime, 'CH-B');
  assert('K', 'expired payment_pending charger becomes AVAILABLE', chargerBStatusK === 'AVAILABLE', `status=${chargerBStatusK}`);

  // TEST L: demo-pay rejects expired locked booking
  const expiredLockForPay = await Booking.create({
    bookingReference: `VS-EXPLOCKPAY-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'locked',
    lockedUntil: new Date(Date.now() - 10000),
    active: true,
    energyKwh: 20,
    amountDue: 300,
    checkInCode: 'VP-EXPLOCKPAY'
  });

  const demoPayL = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver2Token}` },
    body: JSON.stringify({ bookingId: expiredLockForPay._id })
  });
  assert(
    'L',
    'demo-pay rejects expired locked booking with hold expired error',
    demoPayL.status === 400 && demoPayL.body?.error === 'Your reservation hold has expired. Please reserve the charger again.',
    `status=${demoPayL.status}, error=${demoPayL.body?.error}`
  );

  // TEST M: demo-pay rejects expired payment_pending booking
  const expiredPendingForPay = await Booking.create({
    bookingReference: `VS-EXPPENDPAY-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'payment_pending',
    paymentStatus: 'pending',
    lockedUntil: new Date(Date.now() - 10000),
    active: true,
    energyKwh: 20,
    amountDue: 300,
    checkInCode: 'VP-EXPPENDPAY'
  });

  const demoPayM = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver2Token}` },
    body: JSON.stringify({ bookingId: expiredPendingForPay._id })
  });
  assert(
    'M',
    'demo-pay rejects expired payment_pending booking with hold expired error',
    demoPayM.status === 400 && demoPayM.body?.error === 'Your reservation hold has expired. Please reserve the charger again.',
    `status=${demoPayM.status}, error=${demoPayM.body?.error}`
  );

  // TEST N: closing checkout releases locked/payment_pending booking
  const holdForRelease = await Booking.create({
    bookingReference: `VS-RELTEST-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'payment_pending',
    paymentStatus: 'pending',
    lockedUntil: new Date(Date.now() + 300000),
    active: true,
    energyKwh: 20,
    amountDue: 300,
    checkInCode: 'VP-RELTEST'
  });

  const releaseRes = await api('/bookings/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver2Token}` },
    body: JSON.stringify({ bookingId: holdForRelease._id })
  });
  const refreshedN = await Booking.findById(holdForRelease._id);
  assert(
    'N',
    'closing checkout releases payment_pending booking (status=cancelled, active=false)',
    releaseRes.status === 200 && refreshedN.status === 'cancelled' && refreshedN.active === false
  );

  // TEST O: confirmed booking blocks only its time slot
  const raceBookingId = activeRaceBooking.bookingId || activeRaceBooking._id;
  const payConfirm = await api('/payments/demo-pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeDriverToken}` },
    body: JSON.stringify({ bookingId: raceBookingId })
  });
  assert('O.1', 'demo-pay confirms unexpired booking successfully', payConfirm.status === 200 && payConfirm.body?.success === true);

  const availO = await api(`/stations/${testStation._id}/availability`);
  const chargerAStatusO = getChargerStatus(availO, testSlotTime, 'CH-A');
  assert('O', 'confirmed booking blocks only its time slot (CH-A is BOOKED during testSlotTime)', chargerAStatusO === 'BOOKED', `status=${chargerAStatusO}`);

  // TEST P: same charger is available for next non-overlapping slot
  const availP = await api(`/stations/${testStation._id}/availability`);
  const chargerAStatusP = getChargerStatus(availP, testSlotNext, 'CH-A');
  assert('P', 'same charger is available for next non-overlapping slot (CH-A is AVAILABLE for next slot)', chargerAStatusP === 'AVAILABLE', `status=${chargerAStatusP}`);

  // TEST Q: cancellation releases exact charger/time
  const cancelRes = await api('/bookings/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeDriverToken}` },
    body: JSON.stringify({ bookingId: raceBookingId })
  });
  const availQ = await api(`/stations/${testStation._id}/availability`);
  const chargerAStatusQ = getChargerStatus(availQ, testSlotTime, 'CH-A');
  assert(
    'Q',
    'cancellation releases exact charger/time (CH-A returns to AVAILABLE immediately)',
    cancelRes.status === 200 && chargerAStatusQ === 'AVAILABLE',
    `status=${chargerAStatusQ}`
  );

  // TEST R: completed booking remains in history but does not block future slots
  const completedBooking = await Booking.create({
    bookingReference: `VS-COMPHIST-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-A',
    slotTime: new Date(new Date(testSlotTime).getTime() - 7200000), // 2 hours ago
    slotDurationMinutes: 60,
    status: 'completed',
    paymentStatus: 'paid',
    active: false,
    energyKwh: 30,
    amountDue: 450,
    amountPaid: 450,
    checkInCode: 'VP-COMPHIST'
  });

  const availR = await api(`/stations/${testStation._id}/availability`);
  const chargerAStatusR = getChargerStatus(availR, testSlotTime, 'CH-A');
  const historyR = await api('/bookings/my-bookings', {
    headers: { Authorization: `Bearer ${driver2Token}` }
  });
  const foundInHistory = historyR.body?.some(b => b.checkInCode === 'VP-COMPHIST');
  assert('R', 'completed booking remains in history but does not block current/future slots', chargerAStatusR === 'AVAILABLE' && foundInHistory === true);

  // Setup confirmed booking for Operator check-in tests S, T, U
  const checkInBooking = await Booking.create({
    bookingReference: `VS-CHECKIN-${stamp}`,
    userEmail: driver2Email,
    stationId: testStation._id,
    chargerId: 'CH-B',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'confirmed',
    paymentStatus: 'paid',
    active: true,
    energyKwh: 25,
    amountDue: 375,
    amountPaid: 375,
    checkInCode: `VP-CHECKIN-${stamp.toString().slice(-4)}`
  });

  // TEST S: QR/FastPass verification follows a working operator-authenticated path
  const opCheckInRes = await api('/bookings/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${op1Token}` },
    body: JSON.stringify({ checkInCode: checkInBooking.checkInCode })
  });
  const refreshedBookingS = await Booking.findById(checkInBooking._id);
  assert(
    'S',
    'QR/FastPass verification follows working operator-authenticated path (checkInStatus becomes checked_in)',
    opCheckInRes.status === 200 && opCheckInRes.body?.success === true && refreshedBookingS.checkInStatus === 'checked_in',
    `status=${opCheckInRes.status}, checkInStatus=${refreshedBookingS?.checkInStatus}`
  );

  // TEST T: Driver cannot access operator check-in
  const driverCheckIn = await api('/bookings/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({ checkInCode: checkInBooking.checkInCode })
  });
  assert('T', 'Driver cannot access operator check-in (403 Forbidden)', driverCheckIn.status === 403);

  // TEST U: Operator may check in only bookings belonging to their station
  // Create booking for op2Station
  const op2StationBooking = await Booking.create({
    bookingReference: `VS-OP2ONLY-${stamp}`,
    userEmail: driver2Email,
    stationId: op2Station._id,
    chargerId: 'CH-X',
    slotTime: new Date(testSlotTime),
    slotDurationMinutes: 60,
    status: 'confirmed',
    paymentStatus: 'paid',
    active: true,
    energyKwh: 20,
    amountDue: 300,
    amountPaid: 300,
    checkInCode: `VP-OP2ONLY-${stamp.toString().slice(-4)}`
  });

  // Op1 tries to check in Op2's station booking -> must be rejected with 403
  const crossOpCheckIn = await api('/bookings/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${op1Token}` },
    body: JSON.stringify({ checkInCode: op2StationBooking.checkInCode })
  });
  assert('U', 'Operator cannot check in booking belonging to another operator station (403 Forbidden)', crossOpCheckIn.status === 403);

  // Cleanup test data
  await Booking.deleteMany({ _id: { $in: [
    expiredHoldBooking._id,
    paymentPendingBooking._id,
    activePendingBooking._id,
    expiredLockForPay._id,
    expiredPendingForPay._id,
    holdForRelease._id,
    activeRaceBooking._id,
    completedBooking._id,
    checkInBooking._id,
    op2StationBooking._id
  ] } });
  await Station.deleteMany({ _id: { $in: [testStation._id, op2Station._id] } });
  await User.deleteMany({ _id: { $in: [op1._id, op2._id, driverUserId, driver2Signup.body.user.id || driver2Signup.body.user._id] } });

  console.log(`\n======================================================`);
  console.log(`   Final QA Suite Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (localServer) localServer.close();
  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Final QA Test Suite Error:', err);
  process.exit(1);
});
