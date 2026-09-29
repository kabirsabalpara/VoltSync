import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Navigation, Zap, Filter, RefreshCw, X, Sparkles, SlidersHorizontal, Compass, Layers, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

const AUTOCOMPLETE_SUGGESTIONS = [
  { name: 'Surat, Gujarat', type: 'City', lat: '21.1702', lng: '72.8311' },
  { name: 'Sumul Dairy Road, Katargam', type: 'Hub', lat: '21.2268', lng: '72.8378' },
  { name: 'Katargam Darwaja, Surat', type: 'Locality', lat: '21.2285', lng: '72.8358' },
  { name: 'Ved Road, Katargam', type: 'Locality', lat: '21.2312', lng: '72.8340' },
  { name: 'VR Surat Mall, Dumas Road', type: 'Landmark', lat: '21.1445', lng: '72.7712' },
  { name: 'Adajan Junction, Surat', type: 'Locality', lat: '21.1952', lng: '72.7985' },
  { name: 'VIP Road, Vesu, Surat', type: 'Locality', lat: '21.1350', lng: '72.7745' },
  { name: 'Ring Road Textile Market, Surat', type: 'Hub', lat: '21.1890', lng: '72.8312' },
  { name: 'Surat Railway Station Plaza', type: 'Transit', lat: '21.2052', lng: '72.8415' },
  { name: 'Ghod Dod Road, Athwa', type: 'Locality', lat: '21.1765', lng: '72.8095' },
  { name: 'Piplod Main Road, Surat', type: 'Locality', lat: '21.1530', lng: '72.7820' },
  { name: 'Surat International Airport, Dumas', type: 'Airport', lat: '21.1150', lng: '72.7420' },
  { name: 'Hazira Port Highway', type: 'Highway', lat: '21.1080', lng: '72.6320' },
  { name: 'Ahmedabad, Gujarat', type: 'City', lat: '23.0225', lng: '72.5714' },
  { name: 'Mumbai, Maharashtra', type: 'City', lat: '19.0760', lng: '72.8777' },
  { name: 'Delhi NCR', type: 'City', lat: '28.6139', lng: '77.2090' },
  { name: 'Bangalore, Karnataka', type: 'City', lat: '12.9716', lng: '77.5946' },
  { name: 'Pune, Maharashtra', type: 'City', lat: '18.5204', lng: '73.8567' }
];

const SearchView = ({
  stations,
  searchMode,
  setSearchMode,
  locationName,
  setLocationName,
  routeStartName,
  setRouteStartName,
  routeEndName,
  setRouteEndName,
  onUseCurrentLocation,
  isLocating,
  radius,
  setRadius,
  isLiveLocationActive,
  nearestStation,
  connectorType,
  setConnectorType,
  speedMin,
  setSpeedMin,
  priceMax,
  setPriceMax,
  sortBy,
  setSortBy,
  selectedStation,
  onSelectStation,
  onBookClick,
  onSearchSubmit,
  onRadiusChange,
  onResetFilters,
  recommendation
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false);

  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setLocationName(value);

    if (value.trim().length > 0) {
      const matches = AUTOCOMPLETE_SUGGESTIONS.filter(item =>
        item.name.toLowerCase().includes(value.toLowerCase()) ||
        item.type.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(matches);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    setLocationName(item.name);
    setShowSuggestions(false);
    const coords = (item.lat && item.lng) ? { lat: item.lat, lng: item.lng } : null;
    onSearchSubmit(item.name, coords);
  };

  const handleClearInput = () => {
    setLocationName('');
    setShowSuggestions(false);
  };

  return (
    <>
      {/* FLOATING LEFT SIDEBAR OVERLAY */}
      <div className="floating-search-overlay">
        {isSearchCollapsed ? (
          <button
            type="button"
            onClick={() => setIsSearchCollapsed(false)}
            title="Expand Search & Station Controls"
            style={{
              pointerEvents: 'auto',
              background: 'rgba(16, 17, 24, 0.95)',
              border: '1px solid var(--accent-primary)',
              color: 'var(--text-primary)',
              borderRadius: '30px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
              width: 'fit-content'
            }}
          >
            <Search size={14} style={{ color: 'var(--accent-primary)' }} />
            <span>{locationName ? locationName.split(',')[0] : 'Search Stations'}</span>
            <span style={{ fontSize: '10px', color: 'var(--accent-primary)', background: 'rgba(245, 166, 35, 0.15)', padding: '2px 7px', borderRadius: '10px' }}>
              {stations.length} hubs
            </span>
            <ChevronRight size={14} />
          </button>
        ) : (
          <div className="floating-search-bar" ref={dropdownRef}>
            {/* Row 1: Search Input + Minimize Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setShowSuggestions(false);
                    onSearchSubmit(locationName);
                  }}
                  style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0 10px', height: '38px' }}
                >
                  <button
                    type="submit"
                    title="Search location"
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <Search size={15} style={{ color: locationName ? 'var(--accent-cyan)' : 'var(--text-muted)', marginRight: '6px', flexShrink: 0 }} />
                  </button>
                  <input
                    type="text"
                    value={locationName}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setShowSuggestions(false);
                        onSearchSubmit(locationName);
                      }
                    }}
                    onFocus={() => {
                      if (locationName.trim()) {
                        setFilteredSuggestions(AUTOCOMPLETE_SUGGESTIONS.filter(item => item.name.toLowerCase().includes(locationName.toLowerCase())));
                        setShowSuggestions(true);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      width: '100%',
                      outline: 'none',
                      fontWeight: '500'
                    }}
                    placeholder="Search city or EV station..."
                  />

                  {locationName && (
                    <button
                      type="button"
                      onClick={handleClearInput}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </form>

                {/* Autocomplete Dropdown Popover */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {filteredSuggestions.map((item, index) => (
                      <div
                        key={index}
                        className="autocomplete-item"
                        onClick={() => handleSelectSuggestion(item)}
                      >
                        <MapPin size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span>{item.name}</span>
                        </div>
                        <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px' }}>
                          {item.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Minimize button to tuck away panel */}
              <button
                type="button"
                onClick={() => setIsSearchCollapsed(true)}
                title="Minimize panel for clear map view"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  borderRadius: '10px',
                  height: '38px',
                  width: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Row 2: Near Me GPS + Filters + List Drawer */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={onUseCurrentLocation}
                disabled={isLocating}
                style={{
                  flex: 1.3,
                  background: isLiveLocationActive 
                    ? 'linear-gradient(135deg, #f5a623, #d97706)' 
                    : 'rgba(255,255,255,0.05)',
                  border: isLiveLocationActive ? '1px solid #fff' : '1px solid var(--glass-border)',
                  color: isLiveLocationActive ? '#0d1210' : 'var(--accent-primary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  height: '32px',
                  fontSize: '11px',
                  fontWeight: '700',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                title="Detect GPS Location & Find Nearby Stations"
              >
                {isLocating ? (
                  <>
                    <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Locating...</span>
                  </>
                ) : (
                  <>
                    <Compass size={13} />
                    <span>{isLiveLocationActive ? 'Near Me (Active)' : 'Near Me'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  flex: 1,
                  background: showFilters ? 'rgba(168, 130, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                  border: showFilters ? '1px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
                  color: showFilters ? 'var(--accent-cyan)' : 'var(--text-primary)',
                  borderRadius: '8px',
                  height: '32px',
                  padding: '0 8px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <SlidersHorizontal size={12} /> Filters {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              <button
                type="button"
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                style={{
                  flex: 1,
                  background: isDrawerOpen ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
                  color: isDrawerOpen ? '#0d1210' : 'var(--text-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  height: '32px',
                  padding: '0 8px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <Layers size={12} /> {isDrawerOpen ? 'Close' : `List (${stations.length})`}
              </button>
            </div>

          {/* Dedicated Proximity Radius Selector Strip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '10px', pt: '6px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <Navigation size={12} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontWeight: '600' }}>Nearby Radius:</span>
              {[
                { label: '3 km', val: '3' },
                { label: '5 km', val: '5' },
                { label: '10 km', val: '10' },
                { label: '25 km', val: '25' },
                { label: '50 km', val: '50' },
                { label: 'All', val: 'all' }
              ].map((r) => {
                const isSelected = radius === r.val;
                return (
                  <button
                    key={r.val}
                    type="button"
                    onClick={() => {
                      setRadius(r.val);
                      if (onRadiusChange) {
                        onRadiusChange(r.val);
                      } else {
                        setTimeout(() => onSearchSubmit(), 20);
                      }
                    }}
                    style={{
                      background: isSelected ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#0d1210' : 'var(--text-secondary)',
                      border: isSelected ? 'none' : '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: isSelected ? '700' : '500',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Quick City Presets */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {[
                { label: 'Surat', query: 'Surat', lat: '21.1702', lng: '72.8311' },
                { label: 'Ahmedabad', query: 'Ahmedabad, Gujarat', lat: '23.0225', lng: '72.5714' },
                { label: 'Sumul Dairy', query: 'Sumul Dairy Road, Katargam', lat: '21.2268', lng: '72.8378' },
                { label: 'Katargam', query: 'Katargam Darwaja', lat: '21.2285', lng: '72.8358' },
                { label: 'VR Mall', query: 'VR Surat Mall', lat: '21.1440', lng: '72.7720' },
                { label: 'Adajan', query: 'Adajan', lat: '21.1960', lng: '72.7950' },
                { label: 'Mumbai', query: 'Mumbai', lat: '19.0760', lng: '72.8777' },
                { label: 'Delhi', query: 'Delhi', lat: '28.6139', lng: '77.2090' }
              ].map((chip, idx) => {
                const isActive = locationName.toLowerCase().includes(chip.query.toLowerCase()) && !isLiveLocationActive;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setLocationName(chip.query);
                      const coords = (chip.lat && chip.lng) ? { lat: chip.lat, lng: chip.lng } : null;
                      onSearchSubmit(chip.query, coords);
                    }}
                    style={{
                      background: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: isActive ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: isActive ? '600' : '400'
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expandable Filter Controls Dropdown */}
          {showFilters && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-subtle)' }}>
              {/* Connector Filter */}
              <select
                value={connectorType}
                onChange={(e) => setConnectorType(e.target.value)}
                className="filter-select"
                style={{ height: '34px', fontSize: '12px' }}
              >
                <option value="">All Connectors</option>
                <option value="CCS">CCS 2 (DC Fast)</option>
                <option value="CHAdeMO">CHAdeMO (DC)</option>
                <option value="Type 2">Type 2 (AC)</option>
              </select>

              {/* Speed Filter */}
              <select
                value={speedMin}
                onChange={(e) => setSpeedMin(e.target.value)}
                className="filter-select"
                style={{ height: '34px', fontSize: '12px' }}
              >
                <option value="">Any Speed</option>
                <option value="22">22+ kW (AC Fast)</option>
                <option value="50">50+ kW (DC Fast)</option>
                <option value="120">120+ kW (Superfast)</option>
                <option value="240">240+ kW (Ultra)</option>
              </select>

              {/* Max Price */}
              <select
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                className="filter-select"
                style={{ height: '34px', fontSize: '12px' }}
              >
                <option value="">Any Price</option>
                <option value="15">Max 15 INR/kWh</option>
                <option value="20">Max 20 INR/kWh</option>
              </select>

              {/* Sort Order */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="filter-select"
                style={{ height: '34px', fontSize: '12px', borderColor: 'rgba(245, 166, 35, 0.4)', color: 'var(--accent-primary)' }}
              >
                <option value="distance">Sort by Distance</option>
                <option value="price">Sort by Price</option>
                <option value="availability">Sort by Availability</option>
              </select>

              <button
                onClick={onResetFilters}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '11px',
                  marginLeft: 'auto'
                }}
              >
                <RefreshCw size={11} style={{ marginRight: '4px' }} /> Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* Docked Station Side Detail Card */}
        {selectedStation && (
          <div className="station-side-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {selectedStation.name}
                </div>
                {typeof selectedStation.distance === 'number' && (
                  <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={11} /> {selectedStation.distance.toFixed(1)} km away {selectedStation.drivingMinutes ? `• ~${selectedStation.drivingMinutes} min drive` : ''}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelectStation(null)}
                title="Close"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                ⚡ {selectedStation.chargingSpeedKw} kW Fast DC
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-green)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                ₹{selectedStation.pricingPerKwh}/kWh
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                {selectedStation.connectorTypes?.join(', ')}
              </span>
              <span style={{ fontSize: '10px', color: (selectedStation.realTimeFreeCount || 0) > 0 ? '#10b981' : '#f43f5e', fontWeight: 'bold', marginLeft: 'auto' }}>
                {selectedStation.realTimeFreeCount || 0}/{selectedStation.totalChargers || 4} Free
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => onBookClick(selectedStation)}
                className="action-btn"
                style={{ flex: 2, height: '34px', fontSize: '12px', padding: '0 10px' }}
              >
                Reserve Slot
              </button>
              <button
                type="button"
                onClick={() => {
                  const lat = selectedStation.location.coordinates[1];
                  const lng = selectedStation.location.coordinates[0];
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
                }}
                className="nav-btn"
                style={{ flex: 1, height: '34px', fontSize: '12px', justifyContent: 'center' }}
              >
                Navigate
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FLOATING SIDE DRAWER FOR STATION LIST */}
      {isDrawerOpen && (
        <div className="floating-drawer">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                Charging Stations ({stations.length})
              </h4>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Showing nodes near {locationName}
              </span>
            </div>
            <button
              onClick={() => setIsDrawerOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Smart Redirection Alert Banner */}
          {recommendation && (
            <div style={{ padding: '12px 16px 0 16px' }}>
              <div className="recommendation-banner" style={{ marginTop: 0, padding: '12px' }}>
                <div className="recommendation-title" style={{ fontSize: '12px' }}>
                  <Sparkles size={14} /> This station is full — try this one instead
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Preferred station is full. Recommended alternate:
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{recommendation.name}</div>
                <button
                  onClick={() => onBookClick(recommendation)}
                  className="action-btn"
                  style={{ height: '30px', fontSize: '11px', marginTop: '8px' }}
                >
                  Book Alternate Now
                </button>
              </div>
            </div>
          )}

          {/* Station List Cards */}
          <div className="station-list" style={{ padding: '16px' }}>
            {stations.map((station, idx) => {
              const isSelected = selectedStation && selectedStation._id === station._id;
              const hasFree = station.realTimeFreeCount > 0;
              const freePercent = Math.round((station.realTimeFreeCount / station.totalChargers) * 100);
              const isNearest = (nearestStation && nearestStation._id === station._id) || (idx === 0 && typeof station.distance === 'number');

              return (
                <div
                  key={station._id}
                  onClick={() => onSelectStation(station)}
                  className={`station-card ${isSelected ? 'selected' : ''} ${station.isHighDemand ? 'high-demand' : ''}`}
                  style={{ padding: '14px', position: 'relative' }}
                >
                  {isNearest && typeof station.distance === 'number' && (
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(245, 166, 35, 0.25), rgba(217, 119, 6, 0.25))',
                      border: '1px solid var(--accent-primary)',
                      color: 'var(--accent-primary)',
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginBottom: '8px'
                    }}>
                      <Zap size={11} fill="var(--accent-primary)" /> #1 NEAREST CHARGING NODE
                    </div>
                  )}

                  <div className="card-header">
                    <div>
                      <div className="station-name" style={{ fontSize: '14px' }}>{station.name}</div>
                      {typeof station.distance === 'number' && (
                        <div className="distance-badge" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={11} /> {station.distance.toFixed(1)} km away {station.drivingMinutes ? `• ~${station.drivingMinutes} min drive` : ''}
                        </div>
                      )}
                    </div>
                    {station.isHighDemand && (
                      <span className="demand-badge" style={{ fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Flame size={12} /> High
                      </span>
                    )}
                  </div>

                  <div className="card-details" style={{ fontSize: '12px', margin: '8px 0' }}>
                    <div className="detail-item">
                      <Zap size={12} style={{ color: 'var(--accent-teal)' }} />
                      <span style={{ fontWeight: '600' }}>{station.chargingSpeedKw} kW Fast</span>
                    </div>
                    <div className="detail-item">
                      {station.connectorTypes.map((c, i) => (
                        <span key={i} className="connector-pill" style={{ fontSize: '10px' }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Progress Bar for Visual Availability */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      <span>Availability</span>
                      <span style={{ color: hasFree ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 'bold' }}>
                        {station.realTimeFreeCount} / {station.totalChargers} Free
                      </span>
                    </div>
                    <div className="availability-bar-container" style={{ height: '5px' }}>
                      <div
                        className={`availability-bar-fill ${!hasFree ? 'red' : freePercent <= 30 ? 'orange' : 'green'}`}
                        style={{ width: `${Math.max(8, freePercent)}%` }}
                      />
                    </div>
                  </div>

                  <div className="card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span className="price-value" style={{ fontSize: '13px' }}>₹{station.pricingPerKwh} / kWh</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const [lng, lat] = station.location.coordinates;
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
                        }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Get directions on Google Maps"
                      >
                        <Navigation size={11} /> Maps
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookClick(station);
                        }}
                        style={{
                          background: hasFree ? 'var(--accent-primary)' : 'rgba(239, 68, 68, 0.15)',
                          color: hasFree ? '#0d1210' : 'var(--accent-red)',
                          border: hasFree ? 'none' : '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        {hasFree ? 'Reserve' : 'Queue'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

export default SearchView;


