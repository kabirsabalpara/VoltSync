import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Library, BarChart3, Zap, LogIn, LogOut, User as UserIcon, QrCode, Globe } from 'lucide-react';

import MapView from './components/MapView';
import SearchView from './components/SearchView';
import BookingFlow from './components/BookingFlow';
import OperatorDashboard from './components/OperatorDashboard';
import AuthModal from './components/AuthModal';
import FastPassModal from './components/FastPassModal';
import { API_BASE_URL } from './config';
import { getCurrentCoordinates, reverseGeocode } from './services/locationService';
import { getProcessedFallbackStations } from './services/stationsData';

// Lazy-load Three.js 3D Globe experience to prevent heavy initial bundle
const GlobeIntro = React.lazy(() => import('./components/GlobeIntro'));


const App = () => {
  const [activeTab, setActiveTab] = useState('search'); // search -> bookings -> dashboard
  
  // 3D Globe Experience State
  const [showGlobe, setShowGlobe] = useState(() => {
    try {
      return !localStorage.getItem('voltsync_skip_globe');
    } catch (e) {
      return false;
    }
  });

  // Auth state: Start visitors as guests (null) instead of demo driver
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('voltsync_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [userEmail, setUserEmail] = useState(user ? user.email : '');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [pendingBookingStation, setPendingBookingStation] = useState(null);

  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [searchStatus, setSearchStatus] = useState('idle'); // idle | loading | success | no-results | service-unavailable | sample-mode
  const [isSampleMode, setIsSampleMode] = useState(false);
  const searchAbortControllerRef = useRef(null);
  
  // Search Mode (radius or route)
  const [searchMode, setSearchMode] = useState('radius');

  // Search parameters (Radius Coords)
  const [userLat, setUserLat] = useState('21.1702'); // Default Surat
  const [userLng, setUserLng] = useState('72.8311');
  const [radius, setRadius] = useState('15'); // 15 km default nearby radius
  const [isLocating, setIsLocating] = useState(false);
  const [isLiveLocationActive, setIsLiveLocationActive] = useState(false);
  const [nearestStation, setNearestStation] = useState(null);

  // Search parameters (Route Coords)
  const [startLat, setStartLat] = useState('21.1952'); // Adajan Surat
  const [startLng, setStartLng] = useState('72.7985');
  const [endLat, setEndLat] = useState('21.1445'); // VR Mall Dumas Surat
  const [endLng, setEndLng] = useState('72.7712');

  // Search Location Names (User-facing location queries)
  const [locationName, setLocationName] = useState('Surat, Gujarat');
  const [routeStartName, setRouteStartName] = useState('Adajan Junction, Surat');
  const [routeEndName, setRouteEndName] = useState('VR Surat Mall, Dumas');

  // Filters
  const [connectorType, setConnectorType] = useState('');
  const [speedMin, setSpeedMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sortBy, setSortBy] = useState('distance');

  // Recommendation for fully booked station redirection
  const [redirectionRec, setRedirectionRec] = useState(null);

  // Booking Modal
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingStation, setBookingStation] = useState(null);

  // Booking History
  const [myBookings, setMyBookings] = useState([]);
  const [viewingPassBooking, setViewingPassBooking] = useState(null);

  // Session validation on mount via /auth/me
  useEffect(() => {
    const token = localStorage.getItem('voltsync_token');
    if (token) {
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Session expired');
        })
        .then((userData) => {
          const current = userData.user || userData;
          setUser(current);
          setUserEmail(current.email);
          localStorage.setItem('voltsync_user', JSON.stringify(current));
        })
        .catch(() => {
          // Token expired or invalid
          setUser(null);
          setUserEmail('');
          localStorage.removeItem('voltsync_user');
          localStorage.removeItem('voltsync_token');
        });
    }
  }, []);

  // Handle Auth Login/Signup Success
  const handleAuthSuccess = (userData, token) => {
    setUser(userData);
    setUserEmail(userData.email);
    try {
      localStorage.setItem('voltsync_user', JSON.stringify(userData));
      if (token) localStorage.setItem('voltsync_token', token);
    } catch (e) {}
    
    // If user was waiting to book a station before logging in, proceed with booking
    if (pendingBookingStation) {
      setBookingStation(pendingBookingStation);
      setIsBookingOpen(true);
      setPendingBookingStation(null);
    } else if (userData.role === 'operator') {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setUserEmail('');
    setMyBookings([]);
    try {
      localStorage.removeItem('voltsync_user');
      localStorage.removeItem('voltsync_token');
    } catch (e) {}
  };

  // Geocode location names using local dictionary + OSM Nominatim
  const geocodeLocation = async (query) => {
    const q = query.toLowerCase().trim();
    if (!q) return null;

    // Direct Gujarat & India cities dictionary for instant, ultra-reliable lookups
    // Specific city/locality checks FIRST to avoid broad region overrides
    if (q.includes('sumul') || q.includes('gotalawadi') || q.includes('ved road')) {
      return { lat: '21.2268', lng: '72.8378' };
    }
    if (q.includes('katargam')) {
      return { lat: '21.2285', lng: '72.8358' };
    }
    if (q.includes('surat')) {
      return { lat: '21.1702', lng: '72.8311' };
    }
    if (q.includes('vadodara') || q.includes('baroda')) {
      return { lat: '22.3072', lng: '73.1812' };
    }
    if (q.includes('rajkot')) {
      return { lat: '22.3039', lng: '70.8022' };
    }
    if (q.includes('gandhinagar') || q.includes('gift city')) {
      return { lat: '23.2156', lng: '72.6369' };
    }
    if (q.includes('ahmedabad')) {
      return { lat: '23.0225', lng: '72.5714' };
    }
    if (q.includes('mumbai')) {
      return { lat: '19.0760', lng: '72.8777' };
    }
    if (q.includes('delhi')) {
      return { lat: '28.6139', lng: '77.2090' };
    }
    if (q.includes('pune')) {
      return { lat: '18.5204', lng: '73.8567' };
    }
    if (q.includes('bangalore') || q.includes('bengaluru')) {
      return { lat: '12.9716', lng: '77.5946' };
    }
    if (q.includes('hyderabad')) {
      return { lat: '17.3850', lng: '78.4867' };
    }
    // Broader regional state fallback LAST
    if (q.includes('gujarat') || q.includes('guja')) {
      return { lat: '23.0225', lng: '72.5714' };
    }
    if (q.includes('station a') || q.includes('mall')) {
      return { lat: '12.9736', lng: '77.5976' };
    }
    if (q.includes('station b') || q.includes('residential')) {
      return { lat: '12.9816', lng: '77.6186' };
    }
    if (q.includes('station c') || q.includes('office')) {
      return { lat: '12.9416', lng: '77.5646' };
    }
    if (q.includes('station d') || q.includes('highway') || q.includes('rest stop')) {
      return { lat: '12.9016', lng: '77.4946' };
    }

    try {
      // First try geocoding with India country code restriction so we never land in Europe
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: data[0].lat, lng: data[0].lon };
      }

      // Fallback without country code restriction
      const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.length > 0) {
        return { lat: fallbackData[0].lat, lng: fallbackData[0].lon };
      }
    } catch (e) {
      console.error("Geocoding service error", e);
    }
    return null;
  };

  const fetchStations = async (overrides = {}) => {
    setRedirectionRec(null);
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;

    setSearchStatus('loading');
    const mode = overrides.searchMode || searchMode;
    const latVal = overrides.userLat || userLat;
    const lngVal = overrides.userLng || userLng;
    const sLatVal = overrides.startLat || startLat;
    const sLngVal = overrides.startLng || startLng;
    const eLatVal = overrides.endLat || endLat;
    const eLngVal = overrides.endLng || endLng;
    const radVal = overrides.radius !== undefined ? overrides.radius : radius;
    const cityVal = overrides.cityName || locationName;
    const connVal = overrides.connectorType !== undefined ? overrides.connectorType : connectorType;
    const speedVal = overrides.speedMin !== undefined ? overrides.speedMin : speedMin;
    const priceVal = overrides.priceMax !== undefined ? overrides.priceMax : priceMax;
    const sortVal = overrides.sortBy !== undefined ? overrides.sortBy : sortBy;

    try {
      let url;
      if (mode === 'radius') {
        url = `${API_BASE_URL}/stations?lat=${latVal}&lng=${lngVal}&radius=${radVal}&cityName=${encodeURIComponent(cityVal)}`;
      } else {
        url = `${API_BASE_URL}/stations/route?startLat=${sLatVal}&startLng=${sLngVal}&endLat=${eLatVal}&endLng=${eLngVal}`;
      }

      if (connVal) url += `&connectorType=${encodeURIComponent(connVal)}`;
      if (speedVal) url += `&speedMin=${encodeURIComponent(speedVal)}`;
      if (priceVal) url += `&priceMax=${encodeURIComponent(priceVal)}`;
      url += `&sortBy=${encodeURIComponent(sortVal)}`;

      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        const data = await response.json();
        const stationList = Array.isArray(data) ? data : (data.stations || []);
        setStations(stationList);
        setIsSampleMode(false);
        setSearchStatus(stationList.length > 0 ? 'success' : 'no-results');

        // Compute and track the #1 nearest station
        if (stationList.length > 0) {
          const withDist = [...stationList].filter((s) => typeof s.distance === 'number');
          if (withDist.length > 0) {
            withDist.sort((a, b) => a.distance - b.distance);
            setNearestStation(withDist[0]);
          } else {
            setNearestStation(stationList[0]);
          }
        } else {
          setNearestStation(null);
        }
      } else {
        // If API returns non-200, fallback to resilient local station dataset
        const fallbackList = getProcessedFallbackStations({
          userLat: latVal,
          userLng: lngVal,
          radius: radVal,
          connectorType,
          speedMin,
          priceMax,
          sortBy
        });
        setStations(fallbackList);
        setIsSampleMode(true);
        setSearchStatus('sample-mode');
        setNearestStation(fallbackList.length > 0 ? fallbackList[0] : null);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('API fetch unavailable, using resilient fallback stations:', error);
      const fallbackList = getProcessedFallbackStations({
        userLat: latVal,
        userLng: lngVal,
        radius: radVal,
        connectorType,
        speedMin,
        priceMax,
        sortBy
      });
      setStations(fallbackList);
      setIsSampleMode(true);
      setSearchStatus('sample-mode');
      setNearestStation(fallbackList.length > 0 ? fallbackList[0] : null);
    }
  };

  const handleLoadSampleDirectory = () => {
    setIsSampleMode(true);
    setSearchStatus('sample-mode');
    const sampleList = getProcessedFallbackStations({
      userLat,
      userLng,
      radius,
      connectorType,
      speedMin,
      priceMax,
      sortBy
    });
    setStations(sampleList);
    if (sampleList.length > 0) {
      setNearestStation(sampleList[0]);
    }
  };

  // Immediate initial load on page mount
  useEffect(() => {
    fetchStations();
    if (localStorage.getItem('voltsync_token')) {
      fetchMyBookings();
    }
  }, []);

  // Periodic availability refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'search' && !isSampleMode && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchStations();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, isSampleMode, userLat, userLng, radius, locationName, searchMode]);

  const handleGlobeSelectLocation = (lat, lng, name) => {
    setShowGlobe(false);
    try {
      localStorage.setItem('voltsync_skip_globe', 'true');
    } catch (e) {}
    setUserLat(lat.toString());
    setUserLng(lng.toString());
    setLocationName(name || 'Selected Region');
    fetchStations({
      userLat: lat.toString(),
      userLng: lng.toString(),
      cityName: name || 'Selected Region'
    });
  };

  const handleGlobeSkip = () => {
    setShowGlobe(false);
    try {
      localStorage.setItem('voltsync_skip_globe', 'true');
    } catch (e) {}
  };

  const fetchMyBookings = async () => {
    try {
      const token = localStorage.getItem('voltsync_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/bookings/my-bookings`, { headers });
      const data = await response.json();
      if (response.ok) {
        setMyBookings(data);
      }
    } catch (error) {
      console.error('Error fetching user bookings:', error);
    }
  };

  const handleCancelBooking = async (bookingId, status) => {
    try {
      const token = localStorage.getItem('voltsync_token');
      const endpoint = status === 'locked' 
        ? `${API_BASE_URL}/bookings/release` 
        : `${API_BASE_URL}/bookings/cancel`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ bookingId })
      });
      const data = await response.json();
      if (response.ok) {
        fetchMyBookings();
      } else {
        alert(data.error || 'Failed to cancel booking.');
      }
    } catch (err) {
      console.error('Error cancelling booking:', err);
    }
  };

  const handleSelectStation = (station) => {
    setSelectedStation(station);
    setRedirectionRec(null);

    // If the station is fully booked, trigger redirection check automatically
    if (station && station.realTimeFreeCount === 0) {
      const alternatives = stations
        .filter((s) => s._id !== station._id && s.realTimeFreeCount > 0)
        .sort((a, b) => a.distance - b.distance);

      if (alternatives.length > 0) {
        const best = alternatives[0];
        setRedirectionRec({
          _id: best._id,
          name: best.name,
          distance: Number(best.distance.toFixed(1)),
          freeChargers: best.realTimeFreeCount,
          pricingPerKwh: best.pricingPerKwh,
          chargingSpeedKw: best.chargingSpeedKw,
          location: best.location
        });
      }
    }
  };

  const handleBookClick = (station) => {
    // Require authentication before reserving
    if (!user) {
      setPendingBookingStation(station);
      setIsAuthOpen(true);
      return;
    }
    setBookingStation(station);
    setIsBookingOpen(true);
  };


  // Auto-refresh stations when filter selections change (Issue 21)
  const isFilterMount = useRef(true);
  useEffect(() => {
    if (isFilterMount.current) {
      isFilterMount.current = false;
      return;
    }
    fetchStations({
      connectorType,
      speedMin,
      priceMax,
      sortBy
    });
  }, [connectorType, speedMin, priceMax, sortBy]);

  const handleResetFilters = () => {
    setConnectorType('');
    setSpeedMin('');
    setPriceMax('');
    setSortBy('distance');
    // Explicit parameter overrides to avoid React setState race condition (Issue 22)
    fetchStations({
      connectorType: '',
      speedMin: '',
      priceMax: '',
      sortBy: 'distance'
    });
  };

  const handleBookingSuccess = (_booking) => {
    // Refresh stations to reflect immediately occupied charger slot if booked for current hour
    fetchStations();
    // Refresh booking history
    fetchMyBookings();
  };

  const handleRadiusChange = (newRadius) => {
    setRadius(newRadius);
    fetchStations({
      radius: newRadius,
      userLat,
      userLng,
      cityName: locationName
    });
  };

  const handleSearchSubmit = async (customQuery, directCoords) => {
    // If called from form onSubmit, customQuery might be an event object
    const queryStr = (typeof customQuery === 'string' && customQuery.trim()) 
      ? customQuery.trim() 
      : locationName;

    if (searchMode === 'radius') {
      if (isLiveLocationActive && queryStr.includes('Live GPS')) {
        fetchStations({
          searchMode: 'radius',
          userLat,
          userLng,
          radius,
          cityName: queryStr
        });
        return;
      }
      setIsLiveLocationActive(false);

      const coords = directCoords || await geocodeLocation(queryStr);
      if (coords) {
        setUserLat(coords.lat);
        setUserLng(coords.lng);
        setLocationName(queryStr);
        fetchStations({
          searchMode: 'radius',
          userLat: coords.lat,
          userLng: coords.lng,
          radius,
          cityName: queryStr
        });
      } else {
        alert(`Could not resolve location: "${queryStr}". Please try another search term.`);
      }
    } else {
      // Route corridor search geocoding
      const startCoords = await geocodeLocation(routeStartName);
      const endCoords = await geocodeLocation(routeEndName);
      if (startCoords && endCoords) {
        setStartLat(startCoords.lat);
        setStartLng(startCoords.lng);
        setEndLat(endCoords.lat);
        setEndLng(endCoords.lng);
        fetchStations({
          searchMode: 'route',
          startLat: startCoords.lat,
          startLng: startCoords.lng,
          endLat: endCoords.lat,
          endLng: endCoords.lng
        });
      } else {
        alert("Could not resolve start or end location names. Please check spelling.");
      }
    }
  };

  const handleUseCurrentLocation = async (overrideRadius) => {
    setIsLocating(true);
    try {
      // 1. Get browser GPS position with high accuracy
      const coords = await getCurrentCoordinates({ enableHighAccuracy: true });
      const latStr = coords.lat.toString();
      const lngStr = coords.lng.toString();

      setUserLat(latStr);
      setUserLng(lngStr);
      setIsLiveLocationActive(true);

      // 2. Reverse geocode to get real locality/city name
      const geoInfo = await reverseGeocode(coords.lat, coords.lng);
      const friendlyName = geoInfo.name || `Live GPS (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})`;
      setLocationName(friendlyName);

      const rad = overrideRadius !== undefined ? overrideRadius : radius;

      // 3. Fetch nearby stations around the live GPS coordinates
      await fetchStations({
        searchMode: 'radius',
        userLat: latStr,
        userLng: lngStr,
        radius: rad,
        cityName: friendlyName
      });
    } catch (err) {
      console.warn("Location error, fallback to Katargam Surat hub:", err);
      // Fallback: Katargam Surat Coordinates
      setUserLat('21.2268');
      setUserLng('72.8378');
      setIsLiveLocationActive(true);
      setLocationName('Katargam, Surat');
      await fetchStations({
        searchMode: 'radius',
        userLat: '21.2268',
        userLng: '72.8378',
        radius: radius,
        cityName: 'Katargam, Surat'
      });
    } finally {
      setIsLocating(false);
    }
  };

  const formatSlotTime = (isoString) => {
    const d = new Date(isoString);
    const startHour = d.getHours();
    const endHour = (startHour + 1) % 24;
    return `${d.toLocaleDateString()} | ${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00`;
  };

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="app-header">
        <div className="logo-container">
          <Zap className="logo-icon" size={26} fill="var(--accent-primary)" />
          <span className="logo-text gradient-text">VoltSync EV</span>
        </div>

        {/* Tab Switcher */}
        <nav className="nav-links">
          <button
            onClick={() => setActiveTab('search')}
            className={`nav-btn ${activeTab === 'search' ? 'active' : ''}`}
          >
            <MapPin size={16} /> Find Charger
          </button>
          <button
            onClick={() => setShowGlobe(true)}
            className="nav-btn"
            title="Launch 3D Globe Experience"
          >
            <Globe size={16} /> 3D Globe
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`nav-btn ${activeTab === 'bookings' ? 'active' : ''}`}
          >
            <Library size={16} /> My Reservations
          </button>
          {user?.role === 'operator' && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            >
              <BarChart3 size={16} /> Operator Portal
            </button>
          )}
        </nav>

        {/* User Account / Auth Section */}
        <div className="user-profile">
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '5px 12px', borderRadius: '20px' }}>
                <UserIcon size={14} style={{ color: 'var(--accent-teal)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {user.name}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.1 }}>
                    {user.role === 'operator' ? 'Station Operator' : 'EV Driver'} • {user.email}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="nav-btn"
                style={{ height: '34px', padding: '0 10px', fontSize: '12px', borderColor: 'rgba(255, 71, 87, 0.3)', color: 'var(--accent-red)' }}
                title="Log Out"
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="action-btn"
              style={{ height: '36px', padding: '0 16px', fontSize: '13px' }}
            >
              <LogIn size={15} /> Log In / Register
            </button>
          )}
        </div>
      </header>

      {/* Live Surat Smart Grid Telemetry Pulse Bar */}
      <div className="network-pulse-banner">
        <div className="pulse-indicator-wrap">
          <span className="pulse-ping-dot"></span>
          <span className="pulse-text">Live Telemetry • Surat Smart Grid • 98.4% Uptime</span>
        </div>
        <div className="pulse-tag">
          <span className="pulse-badge-green">{stations.length} Hubs Online</span>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="dashboard-body">
        {activeTab === 'search' && (
          <div className="map-tab-container">
            {/* Full-Screen Map */}
            <MapView
              stations={stations}
              userLocation={searchMode === 'radius' ? [Number(userLat), Number(userLng)] : null}
              selectedStation={selectedStation}
              onSelectStation={handleSelectStation}
              routeCoords={searchMode === 'route' ? {
                start: [Number(startLat), Number(startLng)],
                end: [Number(endLat), Number(endLng)]
              } : null}
              onBookClick={handleBookClick}
              radius={radius}
              isLiveLocationActive={isLiveLocationActive}
              onLocateMe={handleUseCurrentLocation}
              isLocating={isLocating}
            />

            {/* Floating Top Search Bar Overlay & Collapsible List Drawer */}
            <SearchView
              stations={stations}
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              locationName={locationName}
              setLocationName={setLocationName}
              routeStartName={routeStartName}
              setRouteStartName={setRouteStartName}
              routeEndName={routeEndName}
              setRouteEndName={setRouteEndName}
              onUseCurrentLocation={handleUseCurrentLocation}
              isLocating={isLocating}
              radius={radius}
              setRadius={setRadius}
              isLiveLocationActive={isLiveLocationActive}
              nearestStation={nearestStation}
              connectorType={connectorType}
              setConnectorType={setConnectorType}
              speedMin={speedMin}
              setSpeedMin={setSpeedMin}
              priceMax={priceMax}
              setPriceMax={setPriceMax}
              sortBy={sortBy}
              setSortBy={setSortBy}
              selectedStation={selectedStation}
              onSelectStation={handleSelectStation}
              onBookClick={handleBookClick}
              onSearchSubmit={handleSearchSubmit}
              onRadiusChange={handleRadiusChange}
              onResetFilters={handleResetFilters}
              recommendation={redirectionRec}
              searchStatus={searchStatus}
              isSampleMode={isSampleMode}
              onLoadSampleDirectory={handleLoadSampleDirectory}
            />
          </div>
        )}

        {/* Bookings history view tab */}
        {activeTab === 'bookings' && (
          <div className="history-layout">
            <h1 style={{ margin: '0 0 8px 0', fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)' }}>
              Booking History
            </h1>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Check-in details, status codes, and sandbox checkout invoice history.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {myBookings.length === 0 ? (
                <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No bookings found for user <b>{userEmail}</b>. Try creating a new reservation first!
                </div>
              ) : (
                myBookings.map((b) => {
                  const isConfirmed = ['confirmed', 'active'].includes(b.status);
                  const canCancel = ['locked', 'payment_pending', 'confirmed'].includes(b.status);
                  return (
                    <div
                      key={b._id}
                      className={`history-card glass ${isConfirmed ? 'interactive' : ''}`}
                      onClick={() => {
                        if (isConfirmed) setViewingPassBooking(b);
                      }}
                      style={{ cursor: isConfirmed ? 'pointer' : 'default' }}
                      title={isConfirmed ? "Click to view FastPass Digital QR Pass" : undefined}
                    >
                      <div className="history-details">
                        <div className="history-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{b.stationId?.name || 'Charging Station'}</span>
                          {isConfirmed && (
                            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                              <QrCode size={13} /> Digital Pass
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          Outlet Charger: <b>{b.chargerId}</b> <br/>
                          Reserved Time: <b>{formatSlotTime(b.slotTime)}</b> <br/>
                          Amount Paid: <b style={{ color: 'var(--accent-green)' }}>{b.amountPaid} INR</b>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`status-tag ${b.status}`}>
                            {b.status.toUpperCase()}
                          </span>
                          {isConfirmed && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingPassBooking(b);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'rgba(245, 166, 35, 0.15)',
                                border: '1px solid rgba(245, 166, 35, 0.35)',
                                color: 'var(--accent-primary)',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              title="Show QR code for station check-in"
                            >
                              <QrCode size={13} /> View QR Pass
                            </button>
                          )}
                        </div>
                        {b.paymentIntentId && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Ref: {b.paymentIntentId}
                          </div>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelBooking(b._id, b.status);
                            }}
                            style={{
                              background: 'rgba(255, 71, 87, 0.15)',
                              border: '1px solid rgba(255, 71, 87, 0.3)',
                              color: 'var(--accent-red)',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              marginTop: '2px'
                            }}
                          >
                            Cancel Booking
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Admin operator dashboard tab */}
        {activeTab === 'dashboard' && user?.role === 'operator' && <OperatorDashboard />}
      </div>

      {/* Booking popup flow modal */}
      {isBookingOpen && bookingStation && (
        <BookingFlow
          station={bookingStation}
          userEmail={userEmail}
          onClose={() => {
            setIsBookingOpen(false);
            setBookingStation(null);
          }}
          onBookingSuccess={handleBookingSuccess}
        />
      )}

      {/* Login & Sign Up Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* FastPass Digital QR Pass Modal */}
      {viewingPassBooking && (
        <FastPassModal
          booking={viewingPassBooking}
          userEmail={userEmail}
          onClose={() => setViewingPassBooking(null)}
        />
      )}

      {/* 3D Global Earth Opening and Region Navigation */}
      {showGlobe && (
        <React.Suspense fallback={null}>
          <GlobeIntro
            onSelectLocation={handleGlobeSelectLocation}
            onSkip={handleGlobeSkip}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default App;
