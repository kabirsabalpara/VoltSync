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

    if (!apiKey) {
      setMapError(true);
      if (onSwitchToLeaflet) onSwitchToLeaflet();
      return;
    }

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

        const shortName = this.station.name && this.station.name.length > 20 
          ? this.station.name.substring(0, 18) + '...' 
          : (this.station.name || 'EV Station');

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '6px';
        wrapper.style.background = 'rgba(255, 255, 255, 0.98)';
        wrapper.style.border = `2px solid ${this.isSelected ? '#10b981' : borderColor}`;
        wrapper.style.borderRadius = '20px';
        wrapper.style.padding = '5px 12px 5px 6px';
        wrapper.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.15)';
        wrapper.style.whiteSpace = 'nowrap';
        wrapper.style.transform = `scale(${this.isSelected ? 1.12 : 1})`;
        wrapper.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        wrapper.style.userSelect = 'none';

        const iconDiv = document.createElement('div');
        iconDiv.style.width = '22px';
        iconDiv.style.height = '22px';
        iconDiv.style.borderRadius = '50%';
        iconDiv.style.background = bgGradient;
        iconDiv.style.display = 'flex';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.color = '#ffffff';
        iconDiv.style.flexShrink = '0';
        iconDiv.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';

        const textCol = document.createElement('div');
        textCol.style.display = 'flex';
        textCol.style.flexDirection = 'column';
        textCol.style.alignItems = 'flex-start';

        const nameSpan = document.createElement('span');
        nameSpan.style.color = '#0b1c30';
        nameSpan.style.fontSize = '11px';
        nameSpan.style.fontWeight = '700';
        nameSpan.style.lineHeight = '1.2';
        nameSpan.textContent = shortName;

        const subSpan = document.createElement('span');
        subSpan.style.color = badgeColor;
        subSpan.style.fontSize = '10px';
        subSpan.style.fontWeight = '600';
        subSpan.style.lineHeight = '1';
        subSpan.textContent = `${this.station.chargingSpeedKw} kW • ${statusText}`;

        textCol.appendChild(nameSpan);
        textCol.appendChild(subSpan);
        wrapper.appendChild(iconDiv);
        wrapper.appendChild(textCol);
        this.div.appendChild(wrapper);

        this.div.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectStation(this.station);
          showStationInfoWindow(this.station, this.pos);
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
      if (!infoWindow) return;

      const hasFree = station.realTimeFreeCount > 0;
      const lat = station.location.coordinates[1];
      const lng = station.location.coordinates[0];

      // Build safe DOM tree using textContent to prevent XSS
      const container = document.createElement('div');
      container.style.color = '#0f172a';
      container.style.padding = '6px';
      container.style.minWidth = '220px';
      container.style.fontFamily = 'inherit';

      const title = document.createElement('h4');
      title.style.margin = '0 0 6px 0';
      title.style.fontSize = '14px';
      title.style.fontWeight = '800';
      title.style.color = '#0f172a';
      title.textContent = station.name || 'EV Station';

      const details = document.createElement('div');
      details.style.fontSize = '12px';
      details.style.color = '#475569';
      details.style.marginBottom = '8px';
      details.style.display = 'flex';
      details.style.flexDirection = 'column';
      details.style.gap = '3px';

      const speedRow = document.createElement('div');
      speedRow.textContent = `Charging Speed: ${station.chargingSpeedKw} kW Fast DC`;

      const priceRow = document.createElement('div');
      priceRow.textContent = `Price Rate: ₹${station.pricingPerKwh} / kWh`;

      const connRow = document.createElement('div');
      connRow.textContent = `Connectors: ${(station.connectorTypes || []).join(', ')}`;

      details.appendChild(speedRow);
      details.appendChild(priceRow);
      details.appendChild(connRow);

      if (typeof station.distance === 'number') {
        const distRow = document.createElement('div');
        distRow.textContent = `Distance: ${station.distance.toFixed(1)} km`;
        details.appendChild(distRow);
      }

      const availRow = document.createElement('div');
      availRow.style.color = hasFree ? '#059669' : '#e11d48';
      availRow.style.fontWeight = 'bold';
      availRow.textContent = `Availability: ${station.realTimeFreeCount} of ${station.totalChargers} Free`;
      details.appendChild(availRow);

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '6px';
      btnRow.style.marginTop = '8px';

      const reserveBtn = document.createElement('button');
      reserveBtn.style.flex = '2';
      reserveBtn.style.background = '#f5a623';
      reserveBtn.style.color = '#000';
      reserveBtn.style.border = 'none';
      reserveBtn.style.padding = '6px 10px';
      reserveBtn.style.borderRadius = '6px';
      reserveBtn.style.fontSize = '11px';
      reserveBtn.style.fontWeight = 'bold';
      reserveBtn.style.cursor = 'pointer';
      reserveBtn.textContent = 'Reserve Slot';
      reserveBtn.onclick = () => onBookClick(station);

      const navLink = document.createElement('a');
      navLink.style.flex = '1';
      navLink.style.textAlign = 'center';
      navLink.style.textDecoration = 'none';
      navLink.style.background = '#e2e8f0';
      navLink.style.color = '#0f172a';
      navLink.style.padding = '6px 8px';
      navLink.style.borderRadius = '6px';
      navLink.style.fontSize = '11px';
      navLink.style.fontWeight = 'bold';
      navLink.textContent = 'Navigate';
      navLink.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      navLink.target = '_blank';
      navLink.rel = 'noopener noreferrer';

      btnRow.appendChild(reserveBtn);
      btnRow.appendChild(navLink);

      container.appendChild(title);
      container.appendChild(details);
      container.appendChild(btnRow);

      infoWindow.setContent(container);
      infoWindow.setPosition(latLng);
      infoWindow.open(map);
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
              color: mapType === 'dark' ? '#ffffff' : 'var(--text-secondary)',
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
            <Layers size={12} /> Standard View
          </button>
          <button
            type="button"
            onClick={() => setMapType('satellite')}
            style={{
              background: mapType === 'satellite' ? 'var(--accent-primary)' : 'transparent',
              color: mapType === 'satellite' ? '#ffffff' : 'var(--text-secondary)',
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
            background: isLiveLocationActive ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255, 255, 255, 0.96)',
            border: isLiveLocationActive ? '2px solid #10b981' : '1px solid var(--border-subtle)',
            color: isLiveLocationActive ? '#ffffff' : 'var(--accent-primary)',
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
