import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Zap, MapPin, Navigation, ArrowUpRight, Compass, RefreshCw, Layers } from 'lucide-react';
import GoogleMapView from './GoogleMapView';

// Custom Labeled HTML Badge for map pins
const createLabeledMarker = (station, isSelected) => {
  const hasFree = station.realTimeFreeCount > 0;
  const isHighDemand = station.isHighDemand;

  let bgGradient = 'linear-gradient(135deg, #059669, #10b981)';
  let borderColor = '#10b981';
  let statusText = `${station.realTimeFreeCount}/${station.totalChargers} Free`;
  let badgeColor = '#10b981';

  if (!hasFree) {
    bgGradient = 'linear-gradient(135deg, #e11d48, #f43f5e)';
    borderColor = '#f43f5e';
    statusText = 'FULL';
    badgeColor = '#f43f5e';
  } else if (isHighDemand) {
    bgGradient = 'linear-gradient(135deg, #d97706, #f59e0b)';
    borderColor = '#f59e0b';
    statusText = 'High Demand';
    badgeColor = '#f59e0b';
  }

  const shortName = station.name.length > 22 ? station.name.substring(0, 20) + '...' : station.name;

  return L.divIcon({
    html: `
      <div style="
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(16, 17, 24, 0.96);
        border: 2px solid ${isSelected ? '#a882ff' : borderColor};
        border-radius: 20px;
        padding: 5px 12px 5px 6px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.6);
        white-space: nowrap;
        transform: scale(${isSelected ? 1.1 : 1});
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
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
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-start;">
          <span style="color: #ffffff; font-size: 11px; font-weight: 700; line-height: 1.2;">${shortName}</span>
          <span style="color: ${badgeColor}; font-size: 10px; font-weight: 600; line-height: 1;">${station.chargingSpeedKw} kW • ${statusText}</span>
        </div>
      </div>
    `,
    className: 'custom-labeled-leaflet-marker',
    iconSize: [165, 38],
    iconAnchor: [82, 19],
    popupAnchor: [0, -20]
  });
};

// User Location Pin
const createUserMarker = () => {
  return L.divIcon({
    html: `
      <div style="
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(245, 166, 35, 0.25);
        border: 2px solid #f5a623;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        animation: pulse 2s infinite;
      ">
        <div style="width: 10px; height: 10px; border-radius: 50%; background: #f5a623;"></div>
      </div>
    `,
    className: 'custom-user-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

// Component to auto-fit map bounds to visible stations cleanly
const FitBoundsView = ({ stations, userLocation }) => {
  const map = useMap();
  useEffect(() => {
    if (stations && stations.length > 0) {
      const coords = stations.map(s => [s.location.coordinates[1], s.location.coordinates[0]]);
      if (userLocation) coords.push(userLocation);
      const bounds = L.latLngBounds(coords);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
      }
    } else if (userLocation) {
      map.setView(userLocation, 13);
    }
  }, [stations, userLocation, map]);
  return null;
};

const MapView = ({ 
  stations, 
  userLocation, 
  selectedStation, 
  onSelectStation, 
  routeCoords, 
  onBookClick,
  radius,
  isLiveLocationActive,
  onLocateMe,
  isLocating
}) => {
  const [engine, setEngine] = useState('google'); // 'google' | 'leaflet'
  const center = userLocation || [21.1702, 72.8311]; // Default Surat

  if (engine === 'google') {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <GoogleMapView
          stations={stations}
          userLocation={userLocation}
          selectedStation={selectedStation}
          onSelectStation={onSelectStation}
          routeCoords={routeCoords}
          onBookClick={onBookClick}
          radius={radius}
          isLiveLocationActive={isLiveLocationActive}
          onLocateMe={onLocateMe}
          isLocating={isLocating}
          onError={() => {
            console.warn('Google Maps JS API error, switching to Leaflet');
            setEngine('leaflet');
          }}
          onSwitchToLeaflet={() => setEngine('leaflet')}
        />

        {/* Engine Switcher / Status Pill */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 60,
          background: 'rgba(16, 17, 24, 0.92)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '24px',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
        }}>
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Google Maps Active
          </span>
          <button
            type="button"
            onClick={() => setEngine('leaflet')}
            title="Switch to Leaflet Open Tiles"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '2px 4px'
            }}
          >
            Switch to Leaflet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Switch back to Google Maps pill */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'rgba(16, 17, 24, 0.92)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '24px',
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
      }}>
        <span style={{ fontSize: '11px', color: '#f5a623', fontWeight: '700' }}>
          Leaflet Tiles
        </span>
        <button
          type="button"
          onClick={() => setEngine('google')}
          style={{
            background: 'var(--accent-primary)',
            color: '#0d1210',
            border: 'none',
            borderRadius: '12px',
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Use Google Maps
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        {/* Google Maps tiles with Obsidian Dark CSS Shader */}
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        />

        {/* Auto fit map bounds */}
        <FitBoundsView stations={stations} userLocation={userLocation} />

        {/* User Proximity Radius Circle */}
        {userLocation && isLiveLocationActive && radius && radius !== 'all' && (
          <Circle
            center={userLocation}
            radius={Number(radius) * 1000}
            pathOptions={{
              color: '#f5a623',
              fillColor: '#f5a623',
              fillOpacity: 0.08,
              weight: 2,
              dashArray: '6, 6'
            }}
          />
        )}

        {/* User GPS Location Marker */}
        {userLocation && (
          <Marker position={userLocation} icon={createUserMarker()}>
            <Popup>
              <div style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>
                📍 Your Current Location
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route Line if searching corridor */}
        {routeCoords && routeCoords.start && routeCoords.end && (
          <>
            <Polyline
              positions={[routeCoords.start, routeCoords.end]}
              color="#f5a623"
              weight={5}
              opacity={0.85}
              dashArray="8, 8"
            />
            <Marker position={routeCoords.start} icon={createUserMarker()}>
              <Popup><b>Start Location</b></Popup>
            </Marker>
            <Marker position={routeCoords.end} icon={createUserMarker()}>
              <Popup><b>Destination</b></Popup>
            </Marker>
          </>
        )}

        {/* Station Labeled Markers */}
        {stations.map((station) => {
          const lat = station.location.coordinates[1];
          const lng = station.location.coordinates[0];
          const isSelected = selectedStation && selectedStation._id === station._id;
          const hasFree = station.realTimeFreeCount > 0;

          return (
            <Marker
              key={station._id}
              position={[lat, lng]}
              icon={createLabeledMarker(station, isSelected)}
              eventHandlers={{
                click: () => onSelectStation(station)
              }}
            >
              <Popup>
                <div style={{ color: '#fff', minWidth: '200px', padding: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#f1f2f6' }}>
                      {station.name}
                    </h4>
                  </div>

                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>Charging Speed: <b style={{ color: 'var(--accent-teal)' }}>{station.chargingSpeedKw} kW Fast DC</b></div>
                    <div>Price Rate: <b style={{ color: '#10b981' }}>₹{station.pricingPerKwh} / kWh</b></div>
                    <div>Connectors: <b>{station.connectorTypes.join(', ')}</b></div>
                    {typeof station.distance === 'number' && (
                      <div>Proximity: <b style={{ color: 'var(--accent-primary)' }}>{station.distance.toFixed(1)} km away {station.drivingMinutes ? `(~${station.drivingMinutes} min drive)` : ''}</b></div>
                    )}
                    <div>
                      Availability: <span style={{ color: hasFree ? '#10b981' : '#f43f5e', fontWeight: 'bold' }}>
                        {station.realTimeFreeCount} of {station.totalChargers} Free
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookClick(station);
                      }}
                      style={{
                        flex: 2,
                        background: 'var(--accent-primary)',
                        color: '#0d1210',
                        border: 'none',
                        padding: '8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '11px',
                        textAlign: 'center'
                      }}
                    >
                      Reserve Slot
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
                        window.open(url, '_blank');
                      }}
                      style={{
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '11px',
                        textAlign: 'center'
                      }}
                    >
                      Maps
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

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
            zIndex: 1000,
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
              <span>{isLiveLocationActive ? `Nearby Radar Active (${radius && radius !== 'all' ? radius + 'km' : 'All'})` : 'Find Stations Near Me'}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default MapView;

