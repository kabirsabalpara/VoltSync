# VoltSync EV — Obsidian Smart Charging Network

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-purple.svg)](https://vitejs.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Mongoose-emerald.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)

VoltSync EV is a full-stack smart charging station discovery, real-time slot reservation, dynamic price calculation, and operator telemetry dashboard built with Node.js, Express, MongoDB, and React (Vite).

---

## Key Features

- **Interactive Map & Corridor Search:** Browse charging stations on Leaflet with live availability indicators, search by radius or route corridor, and filter by connector (CCS 2, CHAdeMO, Type 2), speed capacity (kW), and pricing.
- **Smart EV Estimator:** Accurate battery state-of-charge (SoC) calculations tailored for top EV models (Tata Nexon EV Max, MG ZS EV, Hyundai Ioniq 5, BYD Atto 3, Mahindra XUV400).
- **Atomic 5-Minute Slot Hold & Checkout:** Real-time slot locking with automated expiration timers, sandboxed UPI / Card / Wallet simulation, and instant digital pass generation.
- **Digital FastPass Ticket Modal:** Scannable check-in QR code, unique alphanumeric reference code (`VS-XXX-XXXX`), speed ratings, turn-by-turn Google Maps navigation, and PDF print/save support.
- **Operator Command Center:** Role-based access control (RBAC), gross network revenue analytics, utilization metrics, demand hotspots, new station onboarding, and live charger status controls (`free`, `occupied`, `maintenance`).
- **Security & Integrity:**
  - Salted bcrypt password hashing and tamper-proof JSON Web Tokens (JWT).
  - Secure `/api/bookings/my-bookings` reading exclusively from authenticated JWT claims (zero IDOR).
  - Public operator signup lockdown; administrative promotion CLI (`node backend/scripts/createOperator.js <email>`).
  - Strict input sanitization and regex escape against NoSQL injection.

---

## Project Structure

```text
VoltSync/
├── backend/
│   ├── config/             # MongoDB connection, JWT, and database seeding
│   ├── middleware/         # JWT verification and RBAC role authorization
│   ├── models/             # Mongoose schemas (User, Station, Booking)
│   ├── routes/             # REST endpoints (auth, stations, bookings)
│   ├── scripts/            # CLI utilities (createOperator.js)
│   ├── server.js           # Express app entrypoint & CORS setup
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # MapView, SearchView, BookingFlow, FastPassModal, OperatorDashboard, AuthModal
│   │   ├── config.js       # Centralized API base URL config
│   │   ├── App.jsx         # Core application and booking history
│   │   └── index.css       # Obsidian & Electric Amber modern design system
│   ├── vercel.json         # Vercel SPA client rewrite configuration
│   └── vite.config.js
├── verify_fixes.js         # Automated 25-point security & functionality verification test suite
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Node.js (v18 or higher)
- MongoDB running locally on `mongodb://127.0.0.1:27017` or a MongoDB Atlas URI

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env    # Configure your MONGO_URI and JWT_SECRET
node server.js
```
The backend server runs on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The Vite development server runs on `http://localhost:5173`.

### 3. Verification Test Suite
With the backend running, execute:
```bash
node verify_fixes.js
```
Runs 25 automated checks across authentication, authorization, lock expiry, IDOR protection, and rate security.

---

## Live Cloud Deployment

### Backend (Render)
1. Create a new **Web Service** on [Render.com](https://render.com/).
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Environment Variables:
   - `MONGO_URI`: `mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/voltsync?retryWrites=true&w=majority`
   - `JWT_SECRET`: `<your-random-secure-secret>`
   - `PORT`: `5000`

### Frontend (Vercel)
1. Import repository on [Vercel.com](https://vercel.com/).
2. Framework Preset: `Vite`
3. Root Directory: `frontend`
4. Environment Variables:
   - `VITE_API_BASE_URL`: `https://your-backend.onrender.com/api`
5. Deploy.
