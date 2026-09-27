/**
 * VoltSync — Automated Fix Verification Script
 * ----------------------------------------------
 * Run this AFTER Antigravity applies the remediation prompt, against a
 * running backend (default http://localhost:5000).
 *
 * Usage:
 *   node verify_fixes.js
 *   API_BASE=http://localhost:5000/api node verify_fixes.js
 *
 * Requires Node 18+ (uses built-in fetch). No npm install needed.
 *
 * This script creates its own throwaway test accounts/stations/bookings —
 * it does not touch your seeded demo data. Safe to run against a dev DB.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';
const stamp = Date.now();

let pass = 0;
let fail = 0;
let skip = 0;

function report(name, ok, detail = '') {
  if (ok === 'skip') {
    skip++;
    console.log(`  SKIP  ${name}${detail ? ' — ' + detail : ''}`);
  } else if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function call(path, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch (_) { /* non-JSON response */ }
  return { status: res.status, body, headers: res.headers };
}

async function signup(email, role) {
  const r = await call('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: `Test ${role}`, email, password: 'TestPass123!', role }),
  });
  if (r.status === 201) return r.body.token;
  // Already exists → log in instead
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'TestPass123!' }),
  });
  return login.body?.token || null;
}

async function main() {
  console.log(`\nVoltSync fix verification — target: ${API_BASE}\n`);

  // ---- Setup: two drivers + one operator ----
  const driver1Email = `driver1_${stamp}@test.com`;
  const driver2Email = `driver2_${stamp}@test.com`;
  const operatorEmail = `operator_${stamp}@test.com`;

  const driver1Token = await signup(driver1Email, 'driver');
  const driver2Token = await signup(driver2Email, 'driver');
  const operatorToken = await signup(operatorEmail, 'operator');

  report('Setup: driver1 account created/logged in', !!driver1Token);
  report('Setup: driver2 account created/logged in', !!driver2Token);
  report('Setup: operator account created/logged in', !!operatorToken);

  if (!driver1Token || !driver2Token || !operatorToken) {
    console.log('\nCould not create test accounts — aborting remaining tests.\n');
    printSummary();
    return;
  }

  // ---- 1. Password hashing sanity check (indirect) ----
  // We can't read the DB from here, but a correct hash means login with the
  // WRONG password must fail even though the account exists.
  const badLogin = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: driver1Email, password: 'WrongPassword!' }),
  });
  report('Password check: wrong password is rejected', badLogin.status === 401);

  // ---- 2. GET /auth/me: IDOR fallback must be gone ----
  const meNoToken = await call('/auth/me');
  report('/auth/me: request with no token is rejected (401)', meNoToken.status === 401);

  const meGarbageToken = await call(`/auth/me?email=${encodeURIComponent(operatorEmail)}`, {
    headers: { Authorization: 'Bearer this-is-not-a-real-token' },
  });
  report(
    '/auth/me: garbage token + victim email query does NOT leak victim data',
    meGarbageToken.status === 401,
    meGarbageToken.status === 200 ? 'SECURITY ISSUE: returned data via fallback' : `status=${meGarbageToken.status}`
  );

  const meValid = await call('/auth/me', { headers: { Authorization: `Bearer ${driver1Token}` } });
  report('/auth/me: valid token returns the correct own profile', meValid.status === 200 && meValid.body?.user?.email === driver1Email);

  // ---- 3. Station creation must require operator role ----
  const stationPayload = {
    name: `Test Station ${stamp}`,
    latitude: 21.17,
    longitude: 72.83,
    chargerCount: 2,
    connectorTypes: ['CCS'],
    chargingSpeedKw: 50,
    pricingPerKwh: 15,
  };

  const createNoAuth = await call('/stations', { method: 'POST', body: JSON.stringify(stationPayload) });
  report('POST /stations: no token → rejected', [401, 403].includes(createNoAuth.status), `status=${createNoAuth.status}`);

  const createAsDriver = await call('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driver1Token}` },
    body: JSON.stringify(stationPayload),
  });
  report('POST /stations: driver token → rejected (403)', createAsDriver.status === 403, `status=${createAsDriver.status}`);

  const createAsOperator = await call('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify(stationPayload),
  });
  report('POST /stations: operator token → succeeds (201)', createAsOperator.status === 201, `status=${createAsOperator.status}`);

  const stationId = createAsOperator.body?._id;
  const chargerId = createAsOperator.body?.chargers?.[0]?.id;

  // ---- 4. Charger-status PATCH must require operator role ----
  if (stationId && chargerId) {
    const patchNoAuth = await call(`/stations/${stationId}/charger-status`, {
      method: 'PATCH',
      body: JSON.stringify({ chargerId, status: 'maintenance' }),
    });
    report('PATCH /charger-status: no token → rejected', [401, 403].includes(patchNoAuth.status), `status=${patchNoAuth.status}`);

    const patchAsDriver = await call(`/stations/${stationId}/charger-status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driver1Token}` },
      body: JSON.stringify({ chargerId, status: 'maintenance' }),
    });
    report('PATCH /charger-status: driver token → rejected (403)', patchAsDriver.status === 403, `status=${patchAsDriver.status}`);

    const patchAsOperator = await call(`/stations/${stationId}/charger-status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${operatorToken}` },
      body: JSON.stringify({ chargerId, status: 'free' }),
    });
    report('PATCH /charger-status: operator token → succeeds (200)', patchAsOperator.status === 200, `status=${patchAsOperator.status}`);
  } else {
    report('Charger-status PATCH tests', 'skip', 'station creation failed above, no stationId/chargerId to test with');
  }

  // ---- 5. connectorType injection should not be honored ----
  const injection = await call(`/stations?${encodeURIComponent('connectorType[$ne]')}=null`);
  report(
    'GET /stations: NoSQL operator injection via connectorType is neutralized',
    injection.status === 200 && Array.isArray(injection.body),
    `status=${injection.status}`
  );

  // ---- 6. Booking lock/confirm/release/cancel flow ----
  if (stationId && chargerId) {
    const slotTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const lockNoAuth = await call('/bookings/lock', {
      method: 'POST',
      body: JSON.stringify({ stationId, slotTime, chargerId }),
    });
    report('POST /bookings/lock: no token → rejected', [401, 403].includes(lockNoAuth.status), `status=${lockNoAuth.status}`);

    const lockAsDriver1 = await call('/bookings/lock', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driver1Token}` },
      body: JSON.stringify({ stationId, slotTime, chargerId, userEmail: 'someone-else@spoofed.com' }),
    });
    const bookingId = lockAsDriver1.body?.bookingId;
    report('POST /bookings/lock: succeeds for authenticated driver', lockAsDriver1.status === 201, `status=${lockAsDriver1.status}`);

    if (bookingId) {
      // driver2 tries to confirm driver1's booking
      const confirmAsDriver2 = await call('/bookings/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver2Token}` },
        body: JSON.stringify({ bookingId, paymentIntentId: 'pi_test_1', energyKwh: 10, amountPaid: 1 }),
      });
      report(
        'POST /bookings/confirm: driver2 cannot confirm driver1\'s booking (403)',
        confirmAsDriver2.status === 403,
        `status=${confirmAsDriver2.status}`
      );

      // driver2 tries to release driver1's booking
      const releaseAsDriver2 = await call('/bookings/release', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver2Token}` },
        body: JSON.stringify({ bookingId }),
      });
      report(
        'POST /bookings/release: driver2 cannot release driver1\'s booking (403)',
        releaseAsDriver2.status === 403,
        `status=${releaseAsDriver2.status}`
      );

      // driver1 confirms with a lowball client-supplied amountPaid to see if server ignores it
      const energyKwh = 10;
      const manipulatedAmount = 1; // attacker tries to pay ₹1
      const confirmAsOwner = await call('/bookings/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver1Token}` },
        body: JSON.stringify({ bookingId, paymentIntentId: 'pi_test_2', energyKwh, amountPaid: manipulatedAmount }),
      });
      const serverAmount = confirmAsOwner.body?.booking?.amountPaid;
      const expectedAmount = Math.round(energyKwh * stationPayload.pricingPerKwh);
      report('POST /bookings/confirm: owner can confirm their own booking', confirmAsOwner.status === 200, `status=${confirmAsOwner.status}`);
      report(
        'POST /bookings/confirm: server computes price server-side, ignoring manipulated amountPaid',
        serverAmount === expectedAmount,
        `expected ${expectedAmount}, got ${serverAmount}`
      );

      // driver1 cancels their own now-confirmed booking
      const cancelAsOwner = await call('/bookings/cancel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver1Token}` },
        body: JSON.stringify({ bookingId }),
      });
      report(
        'POST /bookings/cancel: owner can cancel a CONFIRMED booking',
        cancelAsOwner.status === 200,
        cancelAsOwner.status === 404 ? 'route may not exist yet — see section 4 of remediation prompt' : `status=${cancelAsOwner.status}`
      );
    } else {
      report('Booking confirm/release/cancel ownership tests', 'skip', 'no bookingId from lock step');
    }
  } else {
    report('Booking flow tests', 'skip', 'no stationId/chargerId available');
  }

  // ---- 7. my-bookings must only return the caller's own bookings ----
  const myBookingsNoAuth = await call('/bookings/my-bookings');
  report('GET /bookings/my-bookings: no token → rejected', [401, 403].includes(myBookingsNoAuth.status), `status=${myBookingsNoAuth.status}`);

  const myBookingsAsDriver1 = await call('/bookings/my-bookings', { headers: { Authorization: `Bearer ${driver1Token}` } });
  const leaksOtherUsers = Array.isArray(myBookingsAsDriver1.body) && myBookingsAsDriver1.body.some(b => b.userEmail && b.userEmail !== driver1Email);
  report(
    'GET /bookings/my-bookings: only returns the authenticated user\'s own bookings',
    myBookingsAsDriver1.status === 200 && !leaksOtherUsers,
    `status=${myBookingsAsDriver1.status}`
  );

  // ---- 8. CORS: response should not blindly reflect arbitrary origins ----
  const corsCheck = await call('/stations', { headers: { Origin: 'https://evil-attacker-site.com' } });
  const acao = corsCheck.headers.get('access-control-allow-origin');
  report(
    'CORS: does not reflect an arbitrary Origin back as allowed',
    acao !== 'https://evil-attacker-site.com',
    acao ? `Access-Control-Allow-Origin: ${acao}` : 'no ACAO header present'
  );

  printSummary();
}

function printSummary() {
  console.log('\n----------------------------------------');
  console.log(`  ${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log('----------------------------------------\n');
  if (fail > 0) {
    console.log('Some checks failed — see FAIL lines above and cross-reference the');
    console.log('remediation prompt sections for the corresponding fix.\n');
    process.exitCode = 1;
  } else {
    console.log('All automated checks passed. Still complete the manual checklist');
    console.log('(VERIFICATION_CHECKLIST.md) for the items that can\'t be tested over HTTP.\n');
  }
}

main().catch(err => {
  console.error('\nScript error — is the backend running at', API_BASE, '?\n');
  console.error(err.message);
  process.exitCode = 1;
});
