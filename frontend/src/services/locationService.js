/**
 * VoltSync User Location Service
 * Provides robust browser geolocation, reverse-geocoding, and distance calculations.
 */

export const DEFAULT_COORDINATES = {
  lat: 21.1702,
  lng: 72.8311,
  name: 'Surat, Gujarat'
};

/**
 * Get current user coordinates using Browser Geolocation API
 * @param {PositionOptions} options
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export const getCurrentCoordinates = (options = {}) => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
      ...options
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        let message = 'Unable to retrieve your location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access was denied. Please allow location access in browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is currently unavailable.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out. Please try again.';
            break;
          default:
            message = error.message || message;
        }
        reject(new Error(message));
      },
      defaultOptions
    );
  });
};

/**
 * Reverse geocode latitude and longitude into human-readable area & city name
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Promise<{name: string, city: string, locality: string}>}
 */
export const reverseGeocode = async (lat, lng) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'en'
        }
      }
    );
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};

      const locality = addr.suburb || addr.neighbourhood || addr.residential || addr.road || '';
      const city = addr.city || addr.town || addr.municipality || addr.state_district || addr.county || 'Local Area';
      const state = addr.state || '';

      let name = locality ? `${locality}, ${city}` : city;
      if (state && !name.includes(state)) {
        name += `, ${state}`;
      }

      return {
        name: name || 'Your Live Location',
        city,
        locality,
        raw: data
      };
    }
  } catch (err) {
    console.warn('Reverse geocoding failed or timed out:', err.message);
  }

  // Graceful fallback coordinate label
  return {
    name: `Near (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    city: 'Current Location',
    locality: ''
  };
};

/**
 * Haversine formula to compute distance in km between two GPS coordinates
 */
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
};

/**
 * Estimate driving time in minutes based on urban traffic speed (default 25 km/h)
 */
export const estimateDrivingMinutes = (distanceKm, avgSpeedKmh = 25) => {
  if (!distanceKm || distanceKm <= 0) return 1;
  return Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
};
