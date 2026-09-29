import React, { useEffect, useRef, useState } from 'react';
import { Zap, MapPin, Navigation, Compass, RefreshCw, Layers, Eye, Car } from 'lucide-react';

// Google Maps Dark Cyber Styles
const GOOGLE_MAPS_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d111a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d111a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#ccd6f6' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64ffda' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#131e24' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e2436' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#141824' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8892b0' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2d3748' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1a202c' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f5a623' }]
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#171d2b' }]
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#070a10' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3b4252' }]
  }
];

// Helper to load Google Maps JS API script safely
let googleMapsPromise = null;
const loadGoogleMapsScript = (apiKey = '') => {
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }

    const existing = document.getElementById('google-maps-js-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps));
      existing.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js-sdk';
    const keyParam = apiKey ? `key=${apiKey}&` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?${keyParam}libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

const GoogleMapView = ({
  stations,
  userLocation,
  selectedStation,
  onSelectStation,
  routeCoords,
  onBookClick,
  radius,
  isLiveLocationActive,
  onLocateMe,
  isLocating,
  onError,
  onSwitchToLeaflet
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const circleRef = useRef(null);
  const routePolylineRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const userMarkerRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapType, setMapType] = useState('dark'); // dark | satellite
  const [showTraffic, setShowTraffic] = useState(false);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // 1. Initialize Google Maps
  useEffect(() => {
    let isMounted = true;

    loadGoogleMapsScript(apiKey)
      .then((googleMaps) => {
        if (!isMounted || !mapContainerRef.current) return;

        const centerLat = userLocation ? userLocation[0] : 21.1702;
        const centerLng = userLocation ? userLocation[1] : 72.8311;

        const map = new googleMaps.Map(mapContainerRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: 13,
          styles: mapType === 'dark' ? GOOGLE_MAPS_DARK_STYLE : null,
          mapTypeId: mapType === 'satellite' ? googleMaps.MapTypeId.HYBRID : googleMaps.MapTypeId.ROADMAP,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy'
        });

        mapInstanceRef.current = map;
        infoWindowRef.current = new googleMaps.InfoWindow();
        trafficLayerRef.current = new googleMaps.TrafficLayer();

        setMapLoaded(true);
      })
      .catch((err) => {
        console.warn('Google Maps JS API load error:', err);
        setMapError(true);
        if (onError) onError(err);
      });

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  // 2. Handle Map Type / Style updates
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    const map = mapInstanceRef.current;
    if (mapType === 'satellite') {
      map.setMapTypeId(window.google.maps.MapTypeId.HYBRID);
      map.setOptions({ styles: null });
    } else {
      map.setMapTypeId(window.google.maps.MapTypeId.ROADMAP);
      map.setOptions({ styles: GOOGLE_MAPS_DARK_STYLE });
    }
  }, [mapType]);

  // 3. Handle Traffic Layer Toggle
  useEffect(() => {
    if (!trafficLayerRef.current || !mapInstanceRef.current) return;
    if (showTraffic) {
      trafficLayerRef.current.setMap(mapInstanceRef.current);
    } else {
      trafficLayerRef.current.setMap(null);
    }
  }, [showTraffic]);

  // 4. Render Station Markers using Google Maps Custom OverlayView
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !window.google) return;

    const map = mapInstanceRef.current;
    const google = window.google;

    // Clear previous station overlays
    markersRef.current.forEach((m) => {
      if (m.setMap) m.setMap(null);
    });
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    // Define Custom OverlayView Class
    class StationOverlay extends google.maps.OverlayView {
      constructor(station, isSelected) {
        super();
        this.station = station;
        this.isSelected = isSelected;
        this.lat = station.location.coordinates[1];
        this.lng = station.location.coordinates[0];
        this.pos = new google.maps.LatLng(this.lat, this.lng);
        this.div = null;
        this.setMap(map);
      }

      onAdd() {
        this.div = document.createElement('div');
        this.div.className = 'google-custom-marker';
        this.div.style.position = 'absolute';
        this.div.style.cursor = 'pointer';
        const freeCount = this.station.realTimeFreeCount !== undefined 
          ? this.station.realTimeFreeCount 
          : (this.station.chargers ? this.station.chargers.filter(c => c.status === 'free').length : 3);
        const totalCount = this.station.totalChargers || (this.station.chargers ? this.station.chargers.length : 4);
        const hasFree = freeCount > 0;
        const isHigh = this.station.isHighDemand || freeCount <= 1;

        let bgGradient = 'linear-gradient(135deg, #059669, #10b981)';
        let borderColor = '#10b981';
        let statusText = `${freeCount}/${totalCount} Free`;
        let badgeColor = '#10b981';

        if (!hasFree) {
          bgGradient = 'linear-gradient(135deg, #e11d48, #f43f5e)';
          borderColor = '#f43f5e';
          statusText = 'FULL';
          badgeColor = '#f43f5e';
        } else if (isHigh) {
          bgGradient = 'linear-gradient(135deg, #d97706, #f59e0b)';
          borderColor = '#f59e0b';
          statusText = 'High Demand';
          badgeColor = '#f59e0b';
        }

        const shortName = this.station.name.length > 20 ? this.station.name.substring(0, 18) + '...' : this.station.name;

        this.div.innerHTML = `
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(16, 17, 24, 0.95);
            border: 2px solid ${this.isSelected ? '#f5a623' : borderColor};
            border-radius: 20px;
            padding: 5px 12px 5px 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.6);
            white-space: nowrap;
            transform: scale(${this.isSelected ? 1.12 : 1});
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
          ">
            <div style="
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background: ${bgGradient};
              display: flex;
              align-items: center;
              justify-content: center;
              color: #0d1210;
              flex-shrink: 0;
            ">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
              <span style="color: #ffffff; font-size: 11px; font-weight: 700; line-height: 1.2;">${shortName}</span>
              <span style="color: ${badgeColor}; font-size: 10px; font-weight: 600; line-height: 1;">${this.station.chargingSpeedKw} kW • ${statusText}</span>
            </div>
          </div>
        `;

        this.div.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectStation(this.station);
        });

        const panes = this.getPanes();
        panes.overlayMouseTarget.appendChild(this.div);
      }

      draw() {
        const overlayProjection = this.getProjection();
        if (!overlayProjection || !this.div) return;
        const point = overlayProjection.fromLatLngToDivPixel(this.pos);
        if (point) {
          this.div.style.left = point.x - 82 + 'px';
          this.div.style.top = point.y - 19 + 'px';
        }
      }

      onRemove() {
        if (this.div && this.div.parentNode) {
          this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      }
    }

    const showStationInfoWindow = (station, latLng) => {
      const infoWindow = infoWindowRef.current;
      const hasFree = station.realTimeFreeCount > 0;
      const lat = station.location.coordinates[1];
      const lng = station.location.coordinates[0];

      const contentString = `
        <div style="color: #0f172a; padding: 6px; min-width: 220px; font-family: inherit;">
          <h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 800; color: #0f172a;">${station.name}</h4>
          <div style="font-size: 12px; color: #475569; margin-bottom: 8px; display: flex; flex-direction: column; gap: 3px;">
            <div>Charging Speed: <b>${station.chargingSpeedKw} kW Fast DC</b></div>
            <div>Price Rate: <b style="color: #059669;">₹${station.pricingPerKwh} / kWh</b></div>
            <div>Connectors: <b>${station.connectorTypes.join(', ')}</b></div>
            ${typeof station.distance === 'number' ? `<div>Distance: <b style="color: #d97706;">${station.distance.toFixed(1)} km</b></div>` : ''}
            <div>Availability: <b style="color: ${hasFree ? '#059669' : '#e11d48'};">${station.realTimeFreeCount} of ${station.totalChargers} Free</b></div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 8px;">
            <button id="iw-reserve-btn" style="flex: 2; background: #f5a623; color: #000; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
              Reserve Slot
            </button>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; text-decoration: none; background: #e2e8f0; color: #0f172a; padding: 6px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">
              Navigate
            </a>
          </div>
        </div>
      `;

      infoWindow.setContent(contentString);
      infoWindow.setPosition(latLng);
      infoWindow.open(map);

      // Add listener to custom button inside InfoWindow
      setTimeout(() => {
        const btn = document.getElementById('iw-reserve-btn');
        if (btn) {
          btn.onclick = () => onBookClick(station);
        }
      }, 50);
    };

    stations.forEach((station) => {
      if (!station?.location?.coordinates || station.location.coordinates.length < 2) return;
      const lat = Number(station.location.coordinates[1]);
      const lng = Number(station.location.coordinates[0]);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = selectedStation && selectedStation._id === station._id;
      const overlay = new StationOverlay(station, isSelected);
      markersRef.current.push(overlay);

      bounds.extend(new google.maps.LatLng(lat, lng));
      hasCoords = true;

      // Center map smoothly if selected
      if (isSelected && map) {
        map.panTo(new google.maps.LatLng(lat, lng));
      }
    });

    // 5. User Location Pin & Circle
    if (userLocation) {
      const userLatLng = new google.maps.LatLng(userLocation[0], userLocation[1]);
      bounds.extend(userLatLng);
      hasCoords = true;

      // Clear previous user marker
      if (userMarkerRef.current && userMarkerRef.current.setMap) {
        userMarkerRef.current.setMap(null);
      }

      class UserOverlay extends google.maps.OverlayView {
        constructor() {
          super();
          this.setMap(map);
        }
        onAdd() {
          this.div = document.createElement('div');
          this.div.style.position = 'absolute';
          this.div.style.zIndex = '500';
          this.div.innerHTML = `
            <div style="
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: rgba(245, 166, 35, 0.25);
              border: 2px solid #f5a623;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.5);
              animation: pulseRadar 2s infinite;
            ">
              <div style="width: 10px; height: 10px; border-radius: 50%; background: #f5a623;"></div>
            </div>
          `;
          const panes = this.getPanes();
          panes.overlayMouseTarget.appendChild(this.div);
        }
        draw() {
          const projection = this.getProjection();
          if (!projection || !this.div) return;
          const point = projection.fromLatLngToDivPixel(userLatLng);
          if (point) {
            this.div.style.left = point.x - 14 + 'px';
            this.div.style.top = point.y - 14 + 'px';
          }
        }
        onRemove() {
          if (this.div && this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
            this.div = null;
          }
        }
      }

      userMarkerRef.current = new UserOverlay();

      // Proximity Radius Circle
      if (circleRef.current) {
        circleRef.current.setMap(null);
      }

      if (isLiveLocationActive && radius && radius !== 'all') {
        circleRef.current = new google.maps.Circle({
          strokeColor: '#f5a623',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#f5a623',
          fillOpacity: 0.08,
          map: map,
          center: userLatLng,
          radius: Number(radius) * 1000
        });
      }
    }

    // 6. Route Line
    if (routeCoords && routeCoords.start && routeCoords.end) {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      const path = [
        { lat: routeCoords.start[0], lng: routeCoords.start[1] },
        { lat: routeCoords.end[0], lng: routeCoords.end[1] }
      ];

      routePolylineRef.current = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#f5a623',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map: map
      });

      bounds.extend(new google.maps.LatLng(path[0].lat, path[0].lng));
      bounds.extend(new google.maps.LatLng(path[1].lat, path[1].lng));
      hasCoords = true;
    }

    // Auto-fit bounds
    if (hasCoords && stations.length > 0) {
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    }
  }, [mapLoaded, stations, selectedStation, userLocation, radius, isLiveLocationActive, routeCoords]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Native Google Maps Canvas */}
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', background: '#0a0d14' }} 
      />

      {/* Floating Google Maps Type Controls Header */}
      <div style={{
        position: 'absolute',
        top: '80px',
        right: '20px',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        {/* Style Selector */}
        <div style={{
          display: 'flex',
          background: 'rgba(16, 17, 24, 0.9)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '3px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
        }}>
          <button
            type="button"
            onClick={() => setMapType('dark')}
            style={{
              background: mapType === 'dark' ? 'var(--accent-primary)' : 'transparent',
              color: mapType === 'dark' ? '#0d1210' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Layers size={12} /> Cyber Dark
          </button>
          <button
            type="button"
            onClick={() => setMapType('satellite')}
            style={{
              background: mapType === 'satellite' ? 'var(--accent-primary)' : 'transparent',
              color: mapType === 'satellite' ? '#0d1210' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Eye size={12} /> Satellite
          </button>
        </div>

        {/* Live Traffic Toggle */}
        <button
          type="button"
          onClick={() => setShowTraffic(!showTraffic)}
          style={{
            background: showTraffic ? 'rgba(52, 211, 153, 0.2)' : 'rgba(16, 17, 24, 0.9)',
            border: showTraffic ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
            color: showTraffic ? 'var(--accent-green)' : 'var(--text-secondary)',
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
          }}
          title="Toggle Google Maps Live Traffic"
        >
          <Car size={13} />
          <span>{showTraffic ? 'Traffic: ON' : 'Live Traffic'}</span>
        </button>
      </div>

      {/* Floating GPS Radar / Locate Me Button */}
      {onLocateMe && (
        <button
          type="button"
          onClick={onLocateMe}
          disabled={isLocating}
          title="Detect Live GPS Location and Find Nearby Stations"
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            zIndex: 50,
            background: isLiveLocationActive ? 'linear-gradient(135deg, #f5a623, #d97706)' : 'rgba(16, 17, 24, 0.92)',
            border: isLiveLocationActive ? '2px solid #fff' : '1px solid rgba(245, 166, 35, 0.5)',
            color: isLiveLocationActive ? '#0d1210' : 'var(--accent-primary)',
            borderRadius: '50px',
            padding: '10px 18px',
            fontSize: '12px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            transition: 'all 0.25s ease'
          }}
        >
          {isLocating ? (
            <>
              <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Scanning GPS...</span>
            </>
          ) : (
            <>
              <Compass size={16} />
              <span>{isLiveLocationActive ? `Nearby Radar (${radius && radius !== 'all' ? radius + 'km' : 'All'})` : 'Find Stations Near Me'}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default GoogleMapView;
