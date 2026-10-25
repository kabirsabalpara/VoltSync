/**
 * VoltSync Authentication Cleanup Test Suite
 * Validates:
 * TEST 1 — Normal Driver Signup (role = driver)
 * TEST 2 — Role Injection Protection ({ role: "operator" } remains role = driver)
 * TEST 3 — Driver Login (successful authentication)
 * TEST 4 — Invalid Login ("Invalid email or password.")
 * TEST 5 — Existing Operator Login (role = operator & Operator Dashboard access)
 * TEST 6 — Driver Authorization (Driver denied from operator APIs: 403 Forbidden)
 * TEST 7 — Password Hashing (bcrypt hash, never plaintext)
 * TEST 8 — Production Demo Controls (Demo shortcuts absent from frontend dist build)
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

process.env.PAYMENT_MODE = 'mock';
process.env.ALLOW_DEMO_PAYMENTS = 'true';

const app = require('../server');
const connectDB = require('../config/db');
const User = require('../models/User');

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

async function api(endpoint, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) }
  });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body, headers: res.headers };
}

async function run() {
  console.log('\n======================================================');
  console.log('   VoltSync Authentication & Signup Security Test');
  console.log('======================================================\n');

  await connectDB();

  const testPort = 5094;
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(testPort, resolve));
  baseUrl = `http://localhost:${testPort}/api`;

  const stamp = Date.now();
  const driverEmail = `clean_driver_${stamp}@test.com`;
  const driverPassword = 'DriverPassword123!';
  const attackEmail = `attack_user_${stamp}@test.com`;
  const opEmail = `legit_op_${stamp}@test.com`;
  const opPassword = 'OperatorPassword123!';

  // TEST 1 — Normal Driver Signup
  console.log('--- TEST 1: Normal Driver Signup ---');
  const resSignup = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Clean Driver',
      email: driverEmail,
      password: driverPassword,
      evModel: 'Tata Nexon EV Max'
    })
  });
  assert('Signup returns 201 Created', resSignup.status === 201);
  assert('Signup user role is "driver"', resSignup.body?.user?.role === 'driver');

  // Verify in MongoDB
  const driverInDb = await User.findOne({ email: driverEmail });
  assert('Database user record role is strictly "driver"', driverInDb?.role === 'driver');

  // TEST 2 — Role Injection Protection
  console.log('\n--- TEST 2: Role Injection Protection ---');
  const resAttack = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Attacker Trying Operator',
      email: attackEmail,
      password: 'AttackPassword123!',
      role: 'operator' // Attempt privilege escalation
    })
  });
  assert('Signup with { role: "operator" } succeeds as driver (201)', resAttack.status === 201);
  assert('Returned role is forced to "driver"', resAttack.body?.user?.role === 'driver');

  const attackInDb = await User.findOne({ email: attackEmail });
  assert('Database record role is forced to "driver", not "operator"', attackInDb?.role === 'driver');

  // TEST 3 — Driver Login
  console.log('\n--- TEST 3: Driver Login ---');
  const resDriverLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: driverEmail,
      password: driverPassword
    })
  });
  assert('Valid Driver login succeeds (200)', resDriverLogin.status === 200);
  assert('Driver token returned', !!resDriverLogin.body?.token);
  assert('Driver role returned in user profile', resDriverLogin.body?.user?.role === 'driver');
  const driverToken = resDriverLogin.body?.token;

  // TEST 4 — Invalid Login
  console.log('\n--- TEST 4: Invalid Login ---');
  const resInvalid = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: driverEmail,
      password: 'WrongPassword999!'
    })
  });
  assert('Invalid password returns 401 Unauthorized', resInvalid.status === 401);
  assert('Error message is "Invalid email or password."', resInvalid.body?.error === 'Invalid email or password.');

  const resNonExistent = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: `non_existent_${stamp}@test.com`,
      password: 'AnyPassword123!'
    })
  });
  assert('Non-existent email returns 401 Unauthorized', resNonExistent.status === 401);
  assert('Error message is "Invalid email or password."', resNonExistent.body?.error === 'Invalid email or password.');

  // TEST 5 — Existing Operator Login
  console.log('\n--- TEST 5: Existing Operator Login ---');
  // Create legitimate operator in DB
  await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Legit Operator',
      email: opEmail,
      password: opPassword
    })
  });
  await User.updateOne({ email: opEmail }, { role: 'operator' });

  const resOpLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: opEmail,
      password: opPassword
    })
  });
  assert('Operator login succeeds (200)', resOpLogin.status === 200);
  assert('Operator user profile role is "operator"', resOpLogin.body?.user?.role === 'operator');
  const opToken = resOpLogin.body?.token;

  // Operator can access Operator analytics
  const resOpAnalytics = await api('/stations/operator/analytics', {
    method: 'GET',
    headers: { Authorization: `Bearer ${opToken}` }
  });
  assert('Operator successfully accesses operator analytics dashboard (200)', resOpAnalytics.status === 200);

  // TEST 6 — Driver Authorization (Driver attempts operator-only API)
  console.log('\n--- TEST 6: Driver Authorization ---');
  const resDriverDeniedAnalytics = await api('/stations/operator/analytics', {
    method: 'GET',
    headers: { Authorization: `Bearer ${driverToken}` }
  });
  assert('Driver denied from operator analytics dashboard (403 Forbidden)', resDriverDeniedAnalytics.status === 403);

  const resDriverDeniedCreateStation = await api('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      name: 'Rogue Station',
      latitude: 19.076,
      longitude: 72.877,
      chargerCount: 2,
      connectorTypes: ['CCS'],
      chargingSpeedKw: 50,
      pricingPerKwh: 15
    })
  });
  assert('Driver denied from creating stations (403 Forbidden)', resDriverDeniedCreateStation.status === 403);

  // TEST 7 — Password Hashing
  console.log('\n--- TEST 7: Password Hashing ---');
  assert('Driver password is never stored as plaintext', driverInDb?.password !== driverPassword);
  assert('Driver password is a valid bcrypt hash', /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(driverInDb?.password));

  // TEST 8 — Production Demo Controls
  console.log('\n--- TEST 8: Production Demo Controls ---');
  const distDir = path.resolve(__dirname, '../../frontend/dist/assets');
  let foundDemoShortcuts = false;
  let foundDriverDemo = false;
  let foundOperatorDemo = false;

  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    for (const f of files) {
      if (f.endsWith('.js')) {
        const content = fs.readFileSync(path.join(distDir, f), 'utf8');
        if (content.includes('Demo Quick Login Shortcuts')) foundDemoShortcuts = true;
        if (content.includes('Fill Driver Demo')) foundDriverDemo = true;
        if (content.includes('Fill Operator Demo')) foundOperatorDemo = true;
      }
    }
    assert('Production build contains NO "Demo Quick Login Shortcuts"', !foundDemoShortcuts);
    assert('Production build contains NO "Fill Driver Demo"', !foundDriverDemo);
    assert('Production build contains NO "Fill Operator Demo"', !foundOperatorDemo);
  } else {
    console.log('  NOTE: frontend/dist not found, please run npm run build in frontend');
  }

  console.log('\n------------------------------------------------------');
  console.log(`Auth Cleanup Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------\n');

  // Clean up test users
  await User.deleteMany({ email: { $in: [driverEmail, attackEmail, opEmail] } });

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
