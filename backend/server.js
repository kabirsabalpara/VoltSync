require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const seedData = require('./config/seed');
const stationRoutes = require('./routes/stations');
const bookingRoutes = require('./routes/bookings');
const authRoutes = require('./routes/auth');
const Station = require('./models/Station');

const app = express();

// Connect to Database
connectDB().then(async () => {
  console.log('Initializing EV Charging Station Network...');
  const existingCount = await Station.countDocuments();
  if (existingCount === 0) {
    await seedData();
  } else {
    console.log(`Found ${existingCount} existing stations — skipping seed.`);
  }
});

// CORS configuration for local development & cloud deployment (Vercel)
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/stations', stationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes);

// Health check and root endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VoltSync Backend API',
    message: 'VoltSync API is live and operational.',
    endpoints: {
      stations: '/api/stations',
      bookings: '/api/bookings',
      auth: '/api/auth',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
