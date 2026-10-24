# VoltSync EV / ChargeConnect — Smart EV Charging Network

[![Node.js](https://img.shields.io/badge/Node.js-v18--v24-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.1-purple.svg)](https://vitejs.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Mongoose-emerald.svg)](https://www.mongodb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)

VoltSync (ChargeConnect) is an enterprise-grade full-stack EV charging station discovery, corridor routing, real-time slot reservation, dynamic price calculation, and operator management system built with **React 19**, **Vite 8**, **Node.js**, **Express**, and **MongoDB/Mongoose**.

---

## Architecture & Key Features

- **Interactive Map & Route Corridor Search:**
  - Real-time station discovery on Google Maps (with custom dark cyber styling) and seamless Leaflet fallback.
  - Safe Google Maps InfoWindows built with native DOM nodes and `textContent` (zero unsanitized HTML string interpolation).
  - True route corridor geometry calculation: stations within configurable corridor distance (5–10 km) of the route polyline.
  - Interactive multi-criteria filtering: connector type (CCS 2, CHAdeMO, Type 2), minimum speed (kW), maximum pricing, and sorting. Immediate reactive updates with explicit state overrides to prevent React race conditions.
  - Priority geocoding dictionary (checking Surat, Vadodara, Rajkot, Gandhinagar, and Ahmedabad before broad regional strings) plus OpenStreetMap Nominatim reverse geocoding.

- **Authoritative Booking Lifecycle & Concurrency Protection:**
  - Strict lifecycle states: `locked` -> `payment_pending` -> `confirmed` -> `active` -> `completed` (with `cancelled` and `expired`).
  - 5-minute atomic booking locks with automated server-side cleanup.
  - Compound unique MongoDB indexes on `(stationId, chargerId, slotTime, active)` preventing double booking under concurrent requests.
  - Canonical slot normalization to exact slot boundaries (e.g., `10:00:00.000Z`).
  - Charger ID validation: ensures the charger exists, belongs to the station, and is not in maintenance.
  - Safe cancellation: cancelling a future booking does not prematurely mark physical chargers free if another current session is active.

- **Cryptographic Payment & Real Checkout:**
  - Official Razorpay payment gateway integration with mandatory HMAC SHA256 server-side signature verification:
    $$\text{HMAC\_SHA256}(\text{order\_id} + "|" + \text{payment\_id}, \text{RAZORPAY\_KEY\_SECRET})$$
  - Timing-safe signature comparison via `crypto.timingSafeEqual`.
  - Client-side random payment IDs are rejected; no fallback confirmations after failed verification.
  - Dedicated development mock payment mode (`PAYMENT_MODE=mock`), strictly disabled in production environments (`process.env.NODE_ENV === 'production'`).
  - Real ISO/IEC 18004 compliant QR codes generated using `qrcode`, encoding secure check-in verification URLs (`/checkin/<token>`).

- **Role-Based Access Control (RBAC) & Station Ownership:**
  - Public registration (`POST /api/auth/signup`) is locked exclusively to `driver`. Privileged client-supplied fields like `role: "operator"` are discarded.
  - Operator accounts can only be created via the controlled administrative CLI (`node scripts/createOperator.js <email>`) or seed scripts.
  - Strict station ownership: `operatorId` is automatically assigned from `req.user.id`. Operators can only view, edit, delete, manage chargers, and access private analytics for stations they own.
  - Date-range aware Operator Analytics (`today`, `7d`, `30d`) with capacity calculations based on active chargers and operating hours.

- **Hardened Security & Production Infrastructure:**
  - Salted `bcryptjs` password hashing exclusively; zero plaintext comparisons or fallbacks.
  - Login strictly authenticates existing records; never creates accounts during login.
  - Explicit CORS whitelist without wildcard matching; localhost origins permitted only in development.
  - Robust server startup: awaits MongoDB connection before Express binds to `PORT`.
  - GET search endpoints are strictly read-only and never write mock records to the database.

---

## Project Structure

```text
VoltSync/
├── backend/
│   ├── config/             # Database connection (db.js), JWT config, seed data (seed.js)
│   ├── middleware/         # auth.js (JWT authentication & requireRole RBAC)
│   ├── models/             # Mongoose schemas: User.js, Station.js, Booking.js
│   ├── routes/             # auth.js, stations.js, bookings.js, payments.js
│   ├── scripts/            # createOperator.js, seedRunner.js, migrateStationOwners.js
│   ├── tests/              # full_integration_test.js, lock_test.js
│   ├── server.js           # Server startup (awaits DB connection), CORS whitelist, routes
│   ├── verify_fixes.js     # 25-point automated security verification test suite
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/     # MapView, GoogleMapView, SearchView, BookingFlow,
│   │   │                   # PaymentGatewayModal, QRCodeView, FastPassModal,
│   │   │                   # OperatorDashboard, AuthModal, GlobeIntro
│   │   ├── services/       # locationService.js, stationsData.js
│   │   ├── config.js       # Centralized API base URL resolver (VITE_API_URL / VITE_API_BASE_URL)
│   │   ├── App.jsx         # Main application orchestrator & reservations history
│   │   └── index.css       # Obsidian & Electric Amber modern responsive UI
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── LICENSE                 # Official MIT License
└── README.md
```

---

## Environment Variables

### Backend Configuration (`backend/.env`)

```ini
PORT=5000
NODE_ENV=development

# MongoDB Connection String
MONGODB_URI=mongodb://127.0.0.1:27017/ev_charging

# JWT Secret (minimum 32 characters in production)
JWT_SECRET=voltsync_secure_random_production_jwt_secret_key_8492048204

# Payment Mode: "mock" (for local/demo usage) or "razorpay" (production)
PAYMENT_MODE=mock
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# CORS Whitelist (comma-separated, no trailing slash)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend Configuration (`frontend/.env`)

```ini
VITE_API_URL=http://localhost:5000
VITE_API_BASE_URL=http://localhost:5000/api

# Google Maps API Key (Optional: Leaflet fallback is automatically active if omitted)
# Recommended: Restrict this key in Google Cloud Console using HTTP referrer restrictions.
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY

# Razorpay Key ID (Required only for real checkout in production)
VITE_RAZORPAY_KEY_ID=
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 to v24.x
- **MongoDB**: Community Server running locally on `localhost:27017` or a MongoDB Atlas URI

### 2. Database Seeding & Development Accounts
Populate the database with pre-configured stations and development test accounts:
```bash
cd backend
npm run seed
```

**Seeded Development Accounts:**
- **Driver:** `driver@example.com` / `DriverPass123!`
- **Operator:** `operator@example.com` / `OperatorPass123!`

### 3. Running the Backend Server
```bash
cd backend
npm start
```
The backend initializes the database connection, cleans expired booking holds, and listens on `http://localhost:5000`.

### 4. Running the Frontend Client
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Running Verification & Integration Tests

With the backend running on `http://localhost:5000`:

1. **Security & Regression Verification Suite:**
   ```bash
   cd backend
   node verify_fixes.js
   ```
   *Validates 25 critical security checkpoints: public signup driver lockdown, IDOR protection, role boundaries, station creation authorization, price manipulation prevention, and CORS policies.*

2. **Full End-to-End Integration Suite:**
   ```bash
   cd backend
   node tests/full_integration_test.js
   ```
   *Validates 25 workflow checkpoints: concurrent booking holds, past-time slot rejection, invalid charger detection, payment order breakdown, HMAC signature verification, QR check-in workflows, and scoped operator analytics.*

3. **Frontend Production Build Check:**
   ```bash
   cd frontend
   npm run build
   ```
   *Compiles the Vite production client bundle.*

---

## License

This project is licensed under the [MIT License](LICENSE).
