const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
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

// Helper: Calculate cross-track / perpendicular distance of point (pLat, pLon) from great-circle line segment (lat1, lon1) -> (lat2, lon2) in km
const getDistanceToSegment = (pLat, pLon, lat1, lon1, lat2, lon2) => {
  const d13 = getDistance(lat1, lon1, pLat, pLon);
  const dTotal = getDistance(lat1, lon1, lat2, lon2);
  if (dTotal === 0) return d13;

  const toRad = deg => deg * Math.PI / 180;

  const phi1 = toRad(lat1);
  const lam1 = toRad(lon1);
  const phi2 = toRad(lat2);
  const lam2 = toRad(lon2);
  const phi3 = toRad(pLat);
  const lam3 = toRad(pLon);

  // Bearing from start to end (1 -> 2)
  const y12 = Math.sin(lam2 - lam1) * Math.cos(phi2);
  const x12 = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1);
  const theta12 = Math.atan2(y12, x12);

  // Bearing from start to station point (1 -> 3)
  const y13 = Math.sin(lam3 - lam1) * Math.cos(phi3);
  const x13 = Math.cos(phi1) * Math.sin(phi3) - Math.sin(phi1) * Math.cos(phi3) * Math.cos(lam3 - lam1);
  const theta13 = Math.atan2(y13, x13);

  const R = 6371; // km
  const delta13 = d13 / R;

  // Cross-track angular distance
  const deltaXt = Math.asin(Math.sin(delta13) * Math.sin(theta13 - theta12));
  const dXt = Math.abs(deltaXt * R);

  // Along-track angular distance
  const cosDeltaAt = Math.cos(delta13) / Math.cos(deltaXt);
  const deltaAt = Math.acos(Math.max(-1, Math.min(1, cosDeltaAt)));
  const dAt = deltaAt * R;

  if (dAt < 0 || Math.cos(theta13 - theta12) < 0) {
    return d13;
  }
  if (dAt > dTotal) {
    return getDistance(lat2, lon2, pLat, pLon);
  }
  return dXt;
};

// 1. POST /api/stations - Register/Create a new station (Operator only, assigns ownership)
router.post('/', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { name, latitude, longitude, chargerCount, connectorTypes, chargingSpeedKw, pricingPerKwh } = req.body;

    if (!name || latitude === undefined || longitude === undefined || !chargerCount || !connectorTypes || !chargingSpeedKw || !pricingPerKwh) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ success: false, error: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.' });
    }

    const count = parseInt(chargerCount, 10);
    if (isNaN(count) || count < 1 || count > 50) {
      return res.status(400).json({ success: false, error: 'Charger count must be between 1 and 50.' });
    }

    const speedNum = Number(chargingSpeedKw);
    if (isNaN(speedNum) || speedNum <= 0 || speedNum > 500) {
      return res.status(400).json({ success: false, error: 'Valid charging speed (1-500 kW) is required.' });
    }

    const priceNum = Number(pricingPerKwh);
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 200) {
      return res.status(400).json({ success: false, error: 'Valid pricing per kWh (0-200 INR) is required.' });
    }

    const VALID_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
    const connectors = Array.isArray(connectorTypes) ? connectorTypes : [connectorTypes];
    const invalidConnectors = connectors.filter(c => !VALID_CONNECTORS.includes(c));
    if (invalidConnectors.length > 0 || connectors.length === 0) {
      return res.status(400).json({ success: false, error: `Invalid connector types. Allowed: ${VALID_CONNECTORS.join(', ')}` });
    }

    // Pre-create chargers array
    const chargers = [];
    for (let i = 1; i <= count; i++) {
      chargers.push({ id: `C${i}`, status: 'free' });
    }

    // Operator ID strictly sourced from authenticated JWT token
    const station = new Station({
      name: String(name).trim(),
      location: {
        type: 'Point',
        coordinates: [lngNum, latNum] // GeoJSON format [lng, lat]
      },
      connectorTypes: connectors,
      chargingSpeedKw: speedNum,
      pricingPerKwh: priceNum,
      chargers,
      liveQueueLength: 0,
      operatorId: req.user.id
    });

    await station.save();
    res.status(201).json(station);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET /api/stations - Search stations with filters (read-only, no mock DB writes)
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius, connectorType, speedMin, priceMax, sortBy, slotTime } = req.query;

    const query = {};

    // Connector Type Filter (Safe against NoSQL injection)
    const ALLOWED_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
    if (connectorType && ALLOWED_CONNECTORS.includes(connectorType)) {
      query.connectorTypes = connectorType;
    }

    // Min Charging Speed Filter
    if (speedMin && !isNaN(Number(speedMin))) {
      query.chargingSpeedKw = { $gte: Number(speedMin) };
    }

    // Max Price Filter
    if (priceMax && !isNaN(Number(priceMax))) {
      query.pricingPerKwh = { $lte: Number(priceMax) };
    }

    let stations = [];
    let hasCoords = false;
    let userLatNum = null;
    let userLngNum = null;

    if (lat !== undefined && lng !== undefined && lat !== '' && lng !== '') {
      userLatNum = Number(lat);
      userLngNum = Number(lng);
      if (!isNaN(userLatNum) && !isNaN(userLngNum) && userLatNum >= -90 && userLatNum <= 90 && userLngNum >= -180 && userLngNum <= 180) {
        hasCoords = true;
      }
    }

    if (hasCoords) {
      const maxDistMeters = (radius && radius !== 'all') ? Math.max(1000, Number(radius) * 1000) : 100000;
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
    } else {
      stations = await Station.find(query);
    }

    const now = new Date();

    // Process stations with live status and distance
    const processedStations = await Promise.all(stations.map(async (station) => {
      let distance = null;
      if (hasCoords) {
        distance = getDistance(userLatNum, userLngNum, station.location.coordinates[1], station.location.coordinates[0]);
      }

      const totalChargers = station.chargers.length;
      const maintenanceCount = station.chargers.filter(c => c.status === 'maintenance').length;
      const usableChargerIds = station.chargers.filter(c => c.status !== 'maintenance').map(c => c.id);

      let slotAvailableChargers = usableChargerIds.length;
      let slotOccupiedCount = 0;

      if (slotTime) {
        const targetSlot = new Date(slotTime);
        if (!isNaN(targetSlot.getTime())) {
          const activeBookings = await Booking.find({
            stationId: station._id,
            slotTime: targetSlot,
            active: true,
            $or: [
              { status: { $in: ['confirmed', 'active'] } },
              { status: 'locked', lockedUntil: { $gt: now } }
            ]
          });
          const bookedChargers = new Set(activeBookings.map(b => b.chargerId));
          slotOccupiedCount = bookedChargers.size;
          slotAvailableChargers = Math.max(0, usableChargerIds.length - slotOccupiedCount);
        }
      }

      // Live status: free count accounts for physical status not maintenance or occupied
      const realTimeFreeCount = station.chargers.filter(c => c.status === 'free').length;
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
        usableChargersCount: usableChargerIds.length,
        maintenanceCount,
        isHighDemand,
        distance: distance !== null ? Number(distance.toFixed(2)) : null,
        drivingMinutes,
        slotAvailableChargers,
        slotOccupiedCount,
        operatorId: station.operatorId,
        availabilitySource: 'VoltSync Operator Grid',
        lastUpdated: now.toISOString()
      };
    }));

    // Sorting
    if (sortBy === 'distance' && hasCoords) {
      processedStations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } else if (sortBy === 'price') {
      processedStations.sort((a, b) => a.pricingPerKwh - b.pricingPerKwh);
    } else if (sortBy === 'availability') {
      processedStations.sort((a, b) => b.realTimeFreeCount - a.realTimeFreeCount);
    } else if (sortBy === 'speed') {
      processedStations.sort((a, b) => b.chargingSpeedKw - a.chargingSpeedKw);
    }

    res.json(processedStations);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2b. GET /api/stations/nearby - Dedicated User Location Nearby Station Finder
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 15, connectorType, speedMin, priceMax, sortBy = 'distance', limit = 30 } = req.query;

    if (lat === undefined || lng === undefined || lat === '' || lng === '') {
      return res.status(400).json({ success: false, error: 'Latitude (lat) and Longitude (lng) query parameters are required.' });
    }

    const userLat = Number(lat);
    const userLng = Number(lng);
    if (isNaN(userLat) || isNaN(userLng) || userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates provided.' });
    }

    const radiusKm = Math.max(1, Number(radius) || 15);
    const maxDistMeters = radiusKm * 1000;

    const query = {};
    const ALLOWED_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
    if (connectorType && ALLOWED_CONNECTORS.includes(connectorType)) {
      query.connectorTypes = connectorType;
    }
    if (speedMin && !isNaN(Number(speedMin))) {
      query.chargingSpeedKw = { $gte: Number(speedMin) };
    }
    if (priceMax && !isNaN(Number(priceMax))) {
      query.pricingPerKwh = { $lte: Number(priceMax) };
    }

    const origin = {
      type: 'Point',
      coordinates: [userLng, userLat]
    };

    const stations = await Station.find({
      ...query,
      location: {
        $near: {
          $geometry: origin,
          $maxDistance: maxDistMeters
        }
      }
    }).limit(Math.min(100, Math.max(1, Number(limit) || 30)));

    const now = new Date();

    const processed = stations.map(station => {
      const distance = getDistance(userLat, userLng, station.location.coordinates[1], station.location.coordinates[0]);
      const drivingMinutes = Math.max(1, Math.round((distance / 25) * 60));
      const realTimeFreeCount = station.chargers.filter(c => c.status === 'free').length;
      const totalChargers = station.chargers.length;
      const maintenanceCount = station.chargers.filter(c => c.status === 'maintenance').length;
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
        maintenanceCount,
        isHighDemand,
        distance: Number(distance.toFixed(2)),
        drivingMinutes,
        operatorId: station.operatorId,
        availabilitySource: 'VoltSync Operator Grid',
        lastUpdated: now.toISOString()
      };
    });

    let nearestStation = null;
    if (processed.length > 0) {
      nearestStation = [...processed].sort((a, b) => a.distance - b.distance)[0];
    }

    // Apply sorting
    if (sortBy === 'price') {
      processed.sort((a, b) => a.pricingPerKwh - b.pricingPerKwh);
    } else if (sortBy === 'availability') {
      processed.sort((a, b) => b.realTimeFreeCount - a.realTimeFreeCount);
    } else if (sortBy === 'speed') {
      processed.sort((a, b) => b.chargingSpeedKw - a.chargingSpeedKw);
    } else {
      processed.sort((a, b) => a.distance - b.distance);
    }

    res.json({
      success: true,
      userLocation: { lat: userLat, lng: userLng },
      radiusKm,
      totalStations: processed.length,
      nearestStation,
      stations: processed
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET /api/stations/route - Search along a route corridor using true route geometry and filters
router.get('/route', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, padding, maxCorridorKm, connectorType, speedMin, priceMax, sortBy = 'distance', availability } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({ success: false, error: 'Start and End coordinates are required.' });
    }

    const sLat = Number(startLat);
    const sLng = Number(startLng);
    const eLat = Number(endLat);
    const eLng = Number(endLng);
    if (isNaN(sLat) || isNaN(sLng) || isNaN(eLat) || isNaN(eLng) ||
        sLat < -90 || sLat > 90 || eLat < -90 || eLat > 90 ||
        sLng < -180 || sLng > 180 || eLng < -180 || eLng > 180) {
      return res.status(400).json({ success: false, error: 'Coordinates must be valid geographical numbers.' });
    }

    // Maximum distance from route line (default 10 km corridor)
    const corridorLimitKm = Math.max(1, Number(maxCorridorKm) || (padding ? Number(padding) * 111 : 10));

    // Base query with filters
    const query = {};
    const ALLOWED_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
    if (connectorType && ALLOWED_CONNECTORS.includes(connectorType)) {
      query.connectorTypes = connectorType;
    }
    if (speedMin && !isNaN(Number(speedMin))) {
      query.chargingSpeedKw = { $gte: Number(speedMin) };
    }
    if (priceMax && !isNaN(Number(priceMax))) {
      query.pricingPerKwh = { $lte: Number(priceMax) };
    }

    // Initial coarse bounding box to narrow DB scan
    const padDegrees = (corridorLimitKm / 111) + 0.05;
    const minLng = Math.min(sLng, eLng) - padDegrees;
    const maxLng = Math.max(sLng, eLng) + padDegrees;
    const minLat = Math.min(sLat, eLat) - padDegrees;
    const maxLat = Math.max(sLat, eLat) + padDegrees;

    query.location = {
      $geoWithin: {
        $box: [
          [minLng, minLat],
          [maxLng, maxLat]
        ]
      }
    };

    const candidateStations = await Station.find(query);
    const now = new Date();

    // Precise corridor geometry calculation
    const processed = [];
    for (const station of candidateStations) {
      const stLat = station.location.coordinates[1];
      const stLng = station.location.coordinates[0];

      const distanceToCorridor = getDistanceToSegment(stLat, stLng, sLat, sLng, eLat, eLng);
      if (distanceToCorridor > corridorLimitKm) {
        continue; // Outside corridor
      }

      const distanceToStart = getDistance(sLat, sLng, stLat, stLng);
      const distanceToEnd = getDistance(eLat, eLng, stLat, stLng);

      const realTimeFreeCount = station.chargers.filter(c => c.status === 'free').length;
      const totalChargers = station.chargers.length;
      const maintenanceCount = station.chargers.filter(c => c.status === 'maintenance').length;
      const demandThreshold = Math.max(1, Math.floor(totalChargers * 0.25));
      const isHighDemand = realTimeFreeCount <= demandThreshold || station.liveQueueLength > 0;

      // Filter by availability if requested
      if ((availability === 'true' || availability === 'free') && realTimeFreeCount === 0) {
        continue;
      }

      processed.push({
        _id: station._id,
        name: station.name,
        location: station.location,
        connectorTypes: station.connectorTypes,
        chargingSpeedKw: station.chargingSpeedKw,
        pricingPerKwh: station.pricingPerKwh,
        chargers: station.chargers,
        realTimeFreeCount,
        totalChargers,
        maintenanceCount,
        isHighDemand,
        corridorDistanceKm: Number(distanceToCorridor.toFixed(2)),
        distanceToStart: Number(distanceToStart.toFixed(2)),
        distanceToEnd: Number(distanceToEnd.toFixed(2)),
        distance: Number(distanceToStart.toFixed(2)), // Consistent with nearby search
        operatorId: station.operatorId,
        availabilitySource: 'VoltSync Route Corridor Proximity',
        lastUpdated: now.toISOString()
      });
    }

    // Apply sorting
    if (sortBy === 'price') {
      processed.sort((a, b) => a.pricingPerKwh - b.pricingPerKwh);
    } else if (sortBy === 'availability') {
      processed.sort((a, b) => b.realTimeFreeCount - a.realTimeFreeCount);
    } else if (sortBy === 'speed') {
      processed.sort((a, b) => b.chargingSpeedKw - a.chargingSpeedKw);
    } else {
      processed.sort((a, b) => a.distanceToStart - b.distanceToStart);
    }

    res.json(processed);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET /api/stations/:id/availability - Availability schedule for upcoming slots
router.get('/:id/availability', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid station ID format.' });
    }

    const station = await Station.findById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found.' });
    }

    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    const endWindow = new Date(currentHour.getTime() + 24 * 60 * 60 * 1000);

    // Atomically expire outdated holds
    await Booking.updateMany(
      {
        stationId: station._id,
        status: 'locked',
        lockedUntil: { $lte: now }
      },
      {
        $set: { status: 'expired', active: false }
      }
    );

    const bookings = await Booking.find({
      stationId: station._id,
      slotTime: { $gte: currentHour, $lt: endWindow },
      active: true,
      $or: [
        { status: { $in: ['confirmed', 'active'] } },
        { status: 'locked', lockedUntil: { $gt: now } }
      ]
    });

    const slots = [];
    const usableChargers = station.chargers.filter(c => c.status !== 'maintenance');

    for (let i = 0; i < 8; i++) {
      const slotTime = new Date(currentHour.getTime() + i * 60 * 60 * 1000);
      const bookedChargerIds = bookings
        .filter(b => b.slotTime.getTime() === slotTime.getTime())
        .map(b => b.chargerId);

      const availableChargers = usableChargers
        .filter(c => !bookedChargerIds.includes(c.id))
        .map(c => c.id);

      slots.push({
        slotTime: slotTime.toISOString(),
        totalChargers: station.chargers.length,
        usableChargers: usableChargers.length,
        availableCount: availableChargers.length,
        availableChargerIds: availableChargers,
        isFullyBooked: availableChargers.length === 0
      });
    }

    res.json({
      success: true,
      station,
      slots,
      availabilitySource: 'VoltSync Real-Time Slot Engine',
      lastUpdated: now.toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. GET /api/stations/operator/analytics - Protected Operator Analytics scoped to owned stations with date-range
router.get('/operator/analytics', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { range = '30d' } = req.query;

    const now = new Date();
    let startDate = new Date();
    let daysCount = 30;

    if (range === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      daysCount = 1;
    } else if (range === '7d' || range === '7days') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      daysCount = 7;
    } else {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      daysCount = 30;
    }

    // Only query stations belonging to the authenticated operator
    const stations = await Station.find({ operatorId: req.user.id });

    const analytics = await Promise.all(stations.map(async (station) => {
      const allBookings = await Booking.find({
        stationId: station._id,
        createdAt: { $gte: startDate }
      });

      const totalBookingsCount = allBookings.length;
      const completedBookings = allBookings.filter(b => b.status === 'completed');
      const confirmedBookings = allBookings.filter(b => b.status === 'confirmed');
      const cancelledBookings = allBookings.filter(b => b.status === 'cancelled');

      // Valid paid revenue
      const revenue = allBookings
        .filter(b => b.status === 'confirmed' || b.status === 'completed')
        .reduce((sum, b) => sum + (b.amountPaid || 0), 0);

      // Energy sold in kWh
      const energySold = allBookings
        .filter(b => b.status === 'confirmed' || b.status === 'completed')
        .reduce((sum, b) => sum + (b.energyKwh || 0), 0);

      const cancellationRate = totalBookingsCount > 0
        ? Math.round((cancelledBookings.length / totalBookingsCount) * 100)
        : 0;

      // Realistic date-range capacity formula: available chargers * 24 operating hours * days
      const availableChargersCount = station.chargers.filter(c => c.status !== 'maintenance').length;
      const totalSlotCapacity = Math.max(1, availableChargersCount * 24 * daysCount);
      const usedSlots = completedBookings.length + confirmedBookings.length;
      const utilizationRate = Math.min(100, Math.round((usedSlots / totalSlotCapacity) * 100));

      const hourCounts = {};
      allBookings.forEach(b => {
        if (b.slotTime) {
          const hour = new Date(b.slotTime).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
      });

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
        availableChargers: station.chargers.filter(c => c.status === 'free').length,
        maintenanceChargers: station.chargers.filter(c => c.status === 'maintenance').length,
        revenue,
        energySold,
        cancellationRate,
        utilizationRate,
        peakHour,
        totalBookings: totalBookingsCount,
        completedBookings: completedBookings.length,
        confirmedBookings: confirmedBookings.length,
        cancelledBookings: cancelledBookings.length,
        liveQueueLength: station.liveQueueLength
      };
    }));

    const hotspots = [...analytics].sort((a, b) => (b.utilizationRate + b.liveQueueLength * 20) - (a.utilizationRate + a.liveQueueLength * 20));

    res.json({
      success: true,
      range,
      daysCount,
      stationAnalytics: analytics,
      hotspots: hotspots.map(h => ({ name: h.stationName, score: h.utilizationRate + h.liveQueueLength * 10 })),
      summary: {
        totalRevenue: analytics.reduce((sum, s) => sum + s.revenue, 0),
        totalBookings: analytics.reduce((sum, s) => sum + s.totalBookings, 0),
        completedBookings: analytics.reduce((sum, s) => sum + s.completedBookings, 0),
        cancelledBookings: analytics.reduce((sum, s) => sum + s.cancelledBookings, 0),
        energySold: analytics.reduce((sum, s) => sum + s.energySold, 0),
        activeStations: stations.length,
        availableChargers: analytics.reduce((sum, s) => sum + s.availableChargers, 0),
        averageUtilization: analytics.length > 0
          ? Math.round(analytics.reduce((sum, s) => sum + s.utilizationRate, 0) / analytics.length)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5b. GET /api/stations/operator/my-stations - Operator station list
router.get('/operator/my-stations', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const stations = await Station.find({ operatorId: req.user.id });
    res.json(stations);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. PATCH /api/stations/:id/charger-status - Update individual charger status (Ownership enforced)
router.patch('/:id/charger-status', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid station ID format.' });
    }

    const { chargerId, status } = req.body;

    if (!chargerId || !status) {
      return res.status(400).json({ success: false, error: 'chargerId and status are required.' });
    }

    const validStatuses = ['free', 'occupied', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const station = await Station.findById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found.' });
    }

    // Verify ownership
    if (!station.operatorId || station.operatorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this station.' });
    }

    const charger = station.chargers.find(c => c.id === chargerId);
    if (!charger) {
      return res.status(404).json({ success: false, error: `Charger ${chargerId} not found on this station.` });
    }

    charger.status = status;
    await station.save();

    res.json(station);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. PATCH /api/stations/:id - Update station parameters & pricing (Ownership enforced)
router.patch('/:id', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid station ID format.' });
    }

    const station = await Station.findById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found.' });
    }

    if (!station.operatorId || station.operatorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this station.' });
    }

    const { name, pricingPerKwh, chargingSpeedKw, connectorTypes, liveQueueLength } = req.body;
    if (name) station.name = String(name).trim();
    if (pricingPerKwh !== undefined && !isNaN(Number(pricingPerKwh))) {
      station.pricingPerKwh = Math.max(1, Number(pricingPerKwh));
    }
    if (chargingSpeedKw !== undefined && !isNaN(Number(chargingSpeedKw))) {
      station.chargingSpeedKw = Math.max(1, Number(chargingSpeedKw));
    }
    if (connectorTypes && Array.isArray(connectorTypes) && connectorTypes.length > 0) {
      const VALID_CONNECTORS = ['CCS', 'CHAdeMO', 'Type 2'];
      const valid = connectorTypes.filter(c => VALID_CONNECTORS.includes(c));
      if (valid.length > 0) station.connectorTypes = valid;
    }
    if (liveQueueLength !== undefined && !isNaN(Number(liveQueueLength))) {
      station.liveQueueLength = Math.max(0, parseInt(liveQueueLength, 10));
    }

    await station.save();
    res.json(station);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. DELETE /api/stations/:id - Delete station (Ownership enforced)
router.delete('/:id', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid station ID format.' });
    }

    const station = await Station.findById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found.' });
    }

    if (!station.operatorId || station.operatorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this station.' });
    }

    await Station.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Station deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. GET /api/stations/:id - Get single station detail
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid station ID format.' });
    }
    const station = await Station.findById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, error: 'Station not found.' });
    }
    res.json(station);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
