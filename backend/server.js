require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { isDbReady } = require('./config/db');
const stationRoutes = require('./routes/stations');
const bookingRoutes = require('./routes/bookings');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');

const app = express();

// Parse and validate trusted origins
const parseAllowedOrigins = () => {
  const envOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowed = new Set(envOrigins);

  // Allow localhost only in development mode
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }

  return Array.from(allowed);
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = parseAllowedOrigins();
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by VoltSync CORS policy.`));
  },
  credentials: true
}));

// Capture rawBody for signature verification (e.g. webhooks) while parsing JSON
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Controlled Database Connection Middleware for API routes
app.use(async (req, res, next) => {
  if (req.path === '/health' || req.path === '/') return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error in request handler:', err.message);
    return res.status(503).json({
      error: 'Database connection unavailable. Please verify MongoDB status.',
      service: 'VoltSync Backend API',
      status: 'degraded'
    });
  }
});

// Primary API Routes
app.use('/api/stations', stationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);

// Root Alias Routes (for client resilience against omitted /api prefixes)
app.use('/stations', stationRoutes);
app.use('/bookings', bookingRoutes);
app.use('/auth', authRoutes);
app.use('/payments', paymentRoutes);


// Health check and root endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VoltSync Backend API',
    message: 'VoltSync API is live and operational.',
    endpoints: {
      stations: '/api/stations',
      nearbyStations: '/api/stations/nearby',
      bookings: '/api/bookings',
      auth: '/api/auth',
      payments: '/api/payments',
      health: '/health',
      apiHealth: '/api/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VoltSync Backend API', time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  const ready = isDbReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    database: ready ? 'connected' : 'disconnected',
    service: 'VoltSync Backend API',
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

// Centralized error handler returning safe JSON without leaking internal stack traces in production
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('Unhandled request error:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error occurred.' : (err.message || 'Unknown error')
  });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  (async () => {
    try {
      console.log('Connecting to MongoDB...');
      await connectDB();
      console.log('Database connected successfully.');

      // Check if stations collection is empty in development, and seed if needed
      const Station = require('./models/Station');
      const count = await Station.countDocuments();
      if (count === 0 && process.env.NODE_ENV !== 'production') {
        console.log('No stations detected in database. Seeding development stations...');
        const seedData = require('./config/seed');
        await seedData();
      }

      app.listen(PORT, () => {
        console.log(`VoltSync API Server is running on port ${PORT}`);
      });
    } catch (err) {
      console.error('Fatal: Database connection failed. Express server will not start.', err.message);
      process.exit(1);
    }
  })();
}

module.exports = app;

