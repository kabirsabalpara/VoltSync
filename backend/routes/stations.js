const express = require('express');
const router = express.Router();
const Station = require('../models/Station');
const Booking = require('../models/Booking');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

// Helper: Calculate distance between two coordinates in km using Haversine formula
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

// 1. POST /api/stations - Register/Create a new station (Operator)
router.post('/', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { name, latitude, longitude, chargerCount, connectorTypes, chargingSpeedKw, pricingPerKwh } = req.body;

    if (!name || !latitude || !longitude || !chargerCount || !connectorTypes || !chargingSpeedKw || !pricingPerKwh) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Pre-create chargers array
    const chargers = [];
    for (let i = 1; i <= chargerCount; i++) {
      chargers.push({ id: `C${i}`, status: 'free' });
    }

    const station = new Station({
      name,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // MongoDB expects [lng, lat]
      },
      connectorTypes,
      chargingSpeedKw,
      pricingPerKwh,
      chargers,
      liveQueueLength: 0
    });

    await station.save();
    res.status(201).json(station);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/stations - Search stations with filters (radius-based)
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius, connectorType, speedMin, priceMax, sortBy, slotTime } = req.query;

    const query = {};

    // 1. Connector Type Filter (Safe against NoSQL injection)
    const ALLOWED_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
    if (connectorType && ALLOWED_CONNECTORS.includes(connectorType)) {
      query.connectorTypes = connectorType;
    }

    // 2. Min Charging Speed Filter
    if (speedMin) {
      query.chargingSpeedKw = { $gte: Number(speedMin) };
    }

    // 3. Max Price Filter
    if (priceMax) {
      query.pricingPerKwh = { $lte: Number(priceMax) };
    }

    let stations = [];

    // Geo-query or standard query
    if (lat && lng) {
      const userLatNum = Number(lat);
      const userLngNum = Number(lng);
      // Default to 50 km max distance if 'all' or unassigned to keep results relevant to the searched city
      const maxDistMeters = (radius && radius !== 'all') ? Number(radius) * 1000 : 50000;
      const origin = {
        type: 'Point',
        coordinates: [userLngNum, userLatNum]
      };

      const geoQuery = { ...query };
      geoQuery.location = {
        $near: {
          $geometry: origin,
          $maxDistance: maxDistMeters
        }
      };

      stations = await Station.find(geoQuery);

      // DYNAMIC GLOBAL SEEDING: If 0 stations are found within radius, dynamically seed 6 stations around this location!
      if (stations.length === 0) {
        const cityClean = req.query.cityName ? req.query.cityName.split(',')[0].trim() : 'Local Area';
        console.log(`No stations found near [${userLngNum}, ${userLatNum}] (${cityClean}). Dynamically seeding stations...`);

        const newMockStations = [
          {
            name: `Tata Power EZ Charge - ${cityClean} Central`,
            location: {
              type: 'Point',
              coordinates: [userLngNum + 0.005, userLatNum + 0.004] // ~600m
            },
            connectorTypes: ['CCS', 'Type 2'],
            chargingSpeedKw: 150,
            pricingPerKwh: 16,
            chargers: [
              { id: 'TP1', status: 'free' },
              { id: 'TP2', status: 'free' },
              { id: 'TP3', status: 'free' },
              { id: 'TP4', status: 'occupied' }
            ],
            liveQueueLength: 0
          },
          {
            name: `Jio-bp Pulse FastCharge - ${cityClean} West`,
            location: {
              type: 'Point',
              coordinates: [userLngNum - 0.008, userLatNum - 0.005] // ~1km
            },
            connectorTypes: ['CCS', 'CHAdeMO'],
            chargingSpeedKw: 240,
            pricingPerKwh: 19,
            chargers: [
              { id: 'JP1', status: 'free' },
              { id: 'JP2', status: 'free' },
              { id: 'JP3', status: 'free' },
              { id: 'JP4', status: 'free' }
            ],
            liveQueueLength: 0
          },
          {
            name: `Zeon Charging Hub - ${cityClean} Bypass`,
            location: {
              type: 'Point',
              coordinates: [userLngNum + 0.012, userLatNum - 0.009] // ~1.5km
            },
            connectorTypes: ['CCS', 'Type 2'],
            chargingSpeedKw: 120,
            pricingPerKwh: 15,
            chargers: [
              { id: 'ZC1', status: 'free' },
              { id: 'ZC2', status: 'free' },
              { id: 'ZC3', status: 'occupied' }
            ],
            liveQueueLength: 0
          },
          {
            name: `Statiq EV Hub - ${cityClean} Commercial Market`,
            location: {
              type: 'Point',
              coordinates: [userLngNum - 0.004, userLatNum + 0.010] // ~1.2km
            },
            connectorTypes: ['CCS', 'CHAdeMO', 'Type 2'],
            chargingSpeedKw: 60,
            pricingPerKwh: 13,
            chargers: [
              { id: 'ST1', status: 'free' },
              { id: 'ST2', status: 'free' },
              { id: 'ST3', status: 'free' }
            ],
            liveQueueLength: 0
          },
          {
            name: `Shell Recharge - ${cityClean} Express Highway`,
            location: {
              type: 'Point',
              coordinates: [userLngNum + 0.015, userLatNum + 0.012] // ~2km
            },
            connectorTypes: ['CCS'],
            chargingSpeedKw: 350,
            pricingPerKwh: 22,
            chargers: [
              { id: 'SH1', status: 'free' },
              { id: 'SH2', status: 'free' },
              { id: 'SH3', status: 'occupied' },
              { id: 'SH4', status: 'occupied' }
            ],
            liveQueueLength: 0
          },
          {
            name: `Ather Grid - ${cityClean} Shopping District`,
            location: {
              type: 'Point',
              coordinates: [userLngNum - 0.011, userLatNum + 0.007] // ~1.4km
            },
            connectorTypes: ['Type 2', 'CCS'],
            chargingSpeedKw: 22,
            pricingPerKwh: 11,
            chargers: [
              { id: 'AG1', status: 'free' },
              { id: 'AG2', status: 'free' },
              { id: 'AG3', status: 'free' }
            ],
            liveQueueLength: 0
          }
        ];

        await Station.create(newMockStations);

        // Re-query to fetch the newly generated stations sorted by distance
        stations = await Station.find(geoQuery);
      }
    } else {
      stations = await Station.find(query);
    }

    const userLat = lat ? Number(lat) : null;
    const userLng = lng ? Number(lng) : null;

    // Process stations to calculate real-time availability, distance, and flags
    const processedStations = await Promise.all(stations.map(async (station) => {
      // Calculate distance if coordinates available
      let distance = null;
      if (userLat && userLng) {
        distance = getDistance(userLat, userLng, station.location.coordinates[1], station.location.coordinates[0]);
      }

      // Calculate availability for a specific requested slot (if provided)
      let slotAvailableChargers = station.chargers.length;
      let slotOccupiedCount = 0;

      if (slotTime) {
        const targetSlot = new Date(slotTime);
        const activeBookings = await Booking.find({
          stationId: station._id,
          slotTime: targetSlot,
          active: true
        });

        // Find how many chargers are booked for this slot
        const bookedChargers = new Set(activeBookings.map(b => b.chargerId));
        slotOccupiedCount = bookedChargers.size;
        slotAvailableChargers = station.chargers.length - slotOccupiedCount;
      }

      // Real-time count of free chargers (current status, not for a future slot)
      const realTimeFreeCount = station.chargers.filter(c => c.status === 'free').length;
      const totalChargers = station.chargers.length;

      // High Demand threshold: free chargers <= 25% of total (or <= 1 for small stations)
      const demandThreshold = Math.max(1, Math.floor(totalChargers * 0.25));
      const isHighDemand = realTimeFreeCount <= demandThreshold || station.liveQueueLength > 0;

      const drivingMinutes = distance !== null ? Math.max(1, Math.round((distance / 25) * 60)) : null;

      return {
        _id: station._id,
        name: station.name,
        location: station.location,
        connectorTypes: station.connectorTypes,
        chargingSpeedKw: station.chargingSpeedKw,
        pricingPerKwh: station.pricingPerKwh,
        chargers: station.chargers,
        liveQueueLength: station.liveQueueLength,
        realTimeFreeCount,
        totalChargers,
        isHighDemand,
        distance: distance !== null ? Number(distance.toFixed(2)) : null,
        drivingMinutes,
        slotAvailableChargers,
        slotOccupiedCount
      };
    }));

    // Sorting
    if (sortBy === 'distance' && userLat && userLng) {
      processedStations.sort((a, b) => a.distance - b.distance);
    } else if (sortBy === 'price') {
      processedStations.sort((a, b) => a.pricingPerKwh - b.pricingPerKwh);
    } else if (sortBy === 'availability') {
      // Sort by descending free charger count (availability)
      processedStations.sort((a, b) => b.realTimeFreeCount - a.realTimeFreeCount);
    }

    res.json(processedStations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2b. GET /api/stations/nearby - Dedicated User Location Nearby Station Finder
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 15, connectorType, speedMin, priceMax, sortBy = 'distance', limit = 30 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude (lat) and Longitude (lng) query parameters are required.' });
    }

    const userLat = Number(lat);
    const userLng = Number(lng);
    const radiusKm = Number(radius) || 15;
    const maxDistMeters = radiusKm * 1000;

    const query = {};
    const ALLOWED_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
    if (connectorType && ALLOWED_CONNECTORS.includes(connectorType)) {
      query.connectorTypes = connectorType;
    }
    if (speedMin) {
      query.chargingSpeedKw = { $gte: Number(speedMin) };
    }
    if (priceMax) {
      query.pricingPerKwh = { $lte: Number(priceMax) };
    }

    const origin = {
      type: 'Point',
      coordinates: [userLng, userLat]
    };

    let stations = await Station.find({
      ...query,
      location: {
        $near: {
          $geometry: origin,
          $maxDistance: maxDistMeters
        }
      }
    }).limit(Number(limit));

    // Dynamic fallback seed if 0 stations within radius
    if (stations.length === 0) {
      const cityClean = req.query.cityName ? req.query.cityName.split(',')[0].trim() : 'Local Area';
      const newMockStations = [
        {
          name: `Tata Power EZ Charge - ${cityClean} QuickCharge Hub`,
          location: { type: 'Point', coordinates: [userLng + 0.005, userLat + 0.003] },
          connectorTypes: ['CCS', 'Type 2'],
          chargingSpeedKw: 150,
          pricingPerKwh: 16,
          chargers: [
            { id: 'TP1', status: 'free' },
            { id: 'TP2', status: 'free' },
            { id: 'TP3', status: 'occupied' },
            { id: 'TP4', status: 'free' }
          ],
          liveQueueLength: 0
        },
        {
          name: `Jio-bp Pulse - ${cityClean} HyperCharge Station`,
          location: { type: 'Point', coordinates: [userLng - 0.007, userLat - 0.005] },
          connectorTypes: ['CCS', 'CHAdeMO'],
          chargingSpeedKw: 240,
          pricingPerKwh: 19,
          chargers: [
            { id: 'JP1', status: 'free' },
            { id: 'JP2', status: 'free' },
            { id: 'JP3', status: 'free' }
          ],
          liveQueueLength: 0
        },
        {
          name: `Statiq EV Station - ${cityClean} Transit Node`,
          location: { type: 'Point', coordinates: [userLng + 0.009, userLat - 0.008] },
          connectorTypes: ['CCS', 'Type 2'],
          chargingSpeedKw: 60,
          pricingPerKwh: 14,
          chargers: [
            { id: 'ST1', status: 'free' },
            { id: 'ST2', status: 'free' }
          ],
          liveQueueLength: 0
        }
      ];

      await Station.create(newMockStations);
      stations = await Station.find({
        ...query,
        location: {
          $near: {
            $geometry: origin,
            $maxDistance: maxDistMeters
          }
        }
      }).limit(Number(limit));
    }

    const processed = stations.map(station => {
      const distance = getDistance(userLat, userLng, station.location.coordinates[1], station.location.coordinates[0]);
      const drivingMinutes = Math.max(1, Math.round((distance / 25) * 60));
      const realTimeFreeCount = station.chargers.filter(c => c.status === 'free').length;
      const totalChargers = station.chargers.length;
      const demandThreshold = Math.max(1, Math.floor(totalChargers * 0.25));
      const isHighDemand = realTimeFreeCount <= demandThreshold || station.liveQueueLength > 0;

      return {
        _id: station._id,
        name: station.name,
        location: station.location,
        connectorTypes: station.connectorTypes,
        chargingSpeedKw: station.chargingSpeedKw,
        pricingPerKwh: station.pricingPerKwh,
        chargers: station.chargers,
        liveQueueLength: station.liveQueueLength,
        realTimeFreeCount,
        totalChargers,
        isHighDemand,
        distance: Number(distance.toFixed(2)),
        drivingMinutes
      };
    });

    if (sortBy === 'price') {
      processed.sort((a, b) => a.pricingPerKwh - b.pricingPerKwh);
    } else if (sortBy === 'availability') {
      processed.sort((a, b) => b.realTimeFreeCount - a.realTimeFreeCount);
    } else {
      processed.sort((a, b) => a.distance - b.distance);
    }

    res.json({
      success: true,
      userLocation: { lat: userLat, lng: userLng },
      radiusKm,
      totalStations: processed.length,
      nearestStation: processed.length > 0 ? processed[0] : null,
      stations: processed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. GET /api/stations/route - Search along a route
router.get('/route', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, padding } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({ error: 'Start and End coordinates are required.' });
    }

    const sLat = Number(startLat);
    const sLng = Number(startLng);
    const eLat = Number(endLat);
    const eLng = Number(endLng);
    const pad = padding ? Number(padding) : 0.05; // default ~5km padding

    // Bounding Box
    const minLng = Math.min(sLng, eLng) - pad;
    const maxLng = Math.max(sLng, eLng) + pad;
    const minLat = Math.min(sLat, eLat) - pad;
    const maxLat = Math.max(sLat, eLat) + pad;

    // Find stations within the corridor bounding box
    const stations = await Station.find({
      location: {
        $geoWithin: {
          $box: [
            [minLng, minLat],
            [maxLng, maxLat]
          ]
        }
      }
    });

    // Compute route distances and details
    const processed = stations.map(station => {
      // Distance from start
      const distanceToStart = getDistance(sLat, sLng, station.location.coordinates[1], station.location.coordinates[0]);
      // Distance from end
      const distanceToEnd = getDistance(eLat, eLng, station.location.coordinates[1], station.location.coordinates[0]);

      const realTimeFreeCount = station.chargers.filter(c => c.status === 'free').length;
      const totalChargers = station.chargers.length;
      const demandThreshold = Math.max(1, Math.floor(totalChargers * 0.25));
      const isHighDemand = realTimeFreeCount <= demandThreshold || station.liveQueueLength > 0;

      return {
        _id: station._id,
        name: station.name,
        location: station.location,
        connectorTypes: station.connectorTypes,
        chargingSpeedKw: station.chargingSpeedKw,
        pricingPerKwh: station.pricingPerKwh,
        chargers: station.chargers,
        realTimeFreeCount,
        totalChargers,
        isHighDemand,
        distanceToStart,
        distanceToEnd
      };
    });

    // Sort by proximity to start
    processed.sort((a, b) => a.distanceToStart - b.distanceToStart);

    res.json(processed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. GET /api/stations/:id/availability - Get specific availability map for upcoming slots
router.get('/:id/availability', async (req, res) => {
  try {
    const station = await Station.findById(req.params.id);
    if (!station) {
      return res.status(404).json({ error: 'Station not found.' });
    }

    // Get active bookings for the next 24 hours
    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    const endWindow = new Date(currentHour.getTime() + 24 * 60 * 60 * 1000);

    // Release any expired locks first (could be done in middleware, but doing it on availability check keeps data fresh)
    await Booking.updateMany(
      {
        stationId: station._id,
        status: 'locked',
        lockedUntil: { $lte: now }
      },
      {
        $set: { status: 'cancelled', active: false }
      }
    );

    const bookings = await Booking.find({
      stationId: station._id,
      slotTime: { $gte: currentHour, $lt: endWindow },
      active: true
    });

    // We generate slots of 1 hour for the next 8 hours for display
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const slotTime = new Date(currentHour.getTime() + i * 60 * 60 * 1000);
      
      // Check which chargers are already booked/locked for this hour
      const bookedChargerIds = bookings
        .filter(b => b.slotTime.getTime() === slotTime.getTime())
        .map(b => b.chargerId);

      const availableChargers = station.chargers
        .filter(c => c.status !== 'maintenance' && !bookedChargerIds.includes(c.id))
        .map(c => c.id);

      slots.push({
        slotTime: slotTime.toISOString(),
        totalChargers: station.chargers.length,
        availableCount: availableChargers.length,
        availableChargerIds: availableChargers,
        isFullyBooked: availableChargers.length === 0
      });
    }

    res.json({
      station,
      slots
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. GET /api/operators/analytics - Generate Operator Reports
router.get('/operator/analytics', async (req, res) => {
  try {
    const stations = await Station.find({});
    
    // We compute metrics: utilization, peak hours, revenue, cancellations, hotspots
    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    const analytics = await Promise.all(stations.map(async (station) => {
      // Find all bookings for this station
      const allBookings = await Booking.find({ stationId: station._id });

      const totalBookingsCount = allBookings.length;
      const confirmedBookings = allBookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
      const cancelledBookings = allBookings.filter(b => b.status === 'cancelled');

      // 1. Revenue
      const revenue = confirmedBookings.reduce((sum, b) => sum + (b.amountPaid || 0), 0);

      // 2. Cancellation/No-show rate
      const cancellationRate = totalBookingsCount > 0 
        ? Math.round((cancelledBookings.length / totalBookingsCount) * 100) 
        : 0;

      // 3. Utilization (Assuming 8 hours of operations represented per charger)
      // Total available slot-hours = chargerCount * 8 hours
      // Total booked slot-hours = confirmedBookings count
      const totalSlotHours = station.chargers.length * 8; 
      const utilizedSlotHours = confirmedBookings.filter(b => b.slotTime <= currentHour).length;
      const utilizationRate = totalSlotHours > 0 
        ? Math.min(100, Math.round((utilizedSlotHours / totalSlotHours) * 100)) 
        : 0;

      // 4. Peak Hours Analysis (count by slot time hour)
      const hourCounts = {};
      confirmedBookings.forEach(b => {
        const hour = new Date(b.slotTime).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      // Find the hour with maximum bookings
      let peakHour = 'N/A';
      let maxHourCount = 0;
      Object.entries(hourCounts).forEach(([hour, count]) => {
        if (count > maxHourCount) {
          maxHourCount = count;
          peakHour = `${hour}:00 - ${Number(hour) + 1}:00`;
        }
      });

      return {
        stationId: station._id,
        stationName: station.name,
        totalChargers: station.chargers.length,
        revenue,
        cancellationRate,
        utilizationRate,
        peakHour,
        totalBookings: totalBookingsCount,
        confirmedBookings: confirmedBookings.length,
        cancelledBookings: cancelledBookings.length,
        liveQueueLength: station.liveQueueLength
      };
    }));

    // Find demand hotspots (stations with high utilization or queue length)
    const hotspots = [...analytics].sort((a, b) => (b.utilizationRate + b.liveQueueLength * 20) - (a.utilizationRate + a.liveQueueLength * 20));

    res.json({
      stationAnalytics: analytics,
      hotspots: hotspots.map(h => ({ name: h.stationName, score: h.utilizationRate + h.liveQueueLength * 10 })),
      summary: {
        totalRevenue: analytics.reduce((sum, s) => sum + s.revenue, 0),
        totalBookings: analytics.reduce((sum, s) => sum + s.totalBookings, 0),
        averageUtilization: analytics.length > 0 
          ? Math.round(analytics.reduce((sum, s) => sum + s.utilizationRate, 0) / analytics.length)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. PATCH /api/stations/:id/charger-status - Update individual charger status (Operator control)
router.patch('/:id/charger-status', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { chargerId, status } = req.body;

    if (!chargerId || !status) {
      return res.status(400).json({ error: 'chargerId and status are required.' });
    }

    const validStatuses = ['free', 'occupied', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updatedStation = await Station.findOneAndUpdate(
      { _id: req.params.id, 'chargers.id': chargerId },
      { $set: { 'chargers.$.status': status } },
      { new: true }
    );

    if (!updatedStation) {
      return res.status(404).json({ error: 'Station or charger not found.' });
    }

    res.json(updatedStation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
