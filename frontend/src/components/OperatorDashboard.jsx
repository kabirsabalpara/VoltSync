import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Sparkles, AlertCircle, BarChart3, TrendingUp, DollarSign, Users, Award } from 'lucide-react';
import { API_BASE_URL } from '../config';

const OperatorDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New Station Form States
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [chargerCount, setChargerCount] = useState(4);
  const [connectorTypes, setConnectorTypes] = useState([]);
  const [chargingSpeedKw, setChargingSpeedKw] = useState(50);
  const [pricingPerKwh, setPricingPerKwh] = useState(15);
  const [formSuccess, setFormSuccess] = useState(null);
  const [stationsList, setStationsList] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [analyticsRes, stationsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/stations/operator/analytics`),
        fetch(`${API_BASE_URL}/stations`)
      ]);
      const data = await analyticsRes.json();
      const stationsData = await stationsRes.json();

      if (analyticsRes.ok) {
        setAnalytics(data);
      } else {
        setError(data.error || 'Failed to fetch operator analytics.');
      }

      if (stationsRes.ok && Array.isArray(stationsData)) {
        setStationsList(stationsData);
      }
    } catch (err) {
      setError('Connection to server failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateChargerStatus = async (stationId, chargerId, newStatus) => {
    try {
      const token = localStorage.getItem('voltsync_token');
      const response = await fetch(`${API_BASE_URL}/stations/${stationId}/charger-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ chargerId, status: newStatus })
      });
      const data = await response.json();
      if (response.ok) {
        fetchAnalytics();
      } else {
        alert(data.error || 'Failed to update charger status.');
      }
    } catch (err) {
      console.error('Error updating charger status:', err);
    }
  };

  const handleRegisterStation = async (e) => {
    e.preventDefault();
    setFormSuccess(null);
    setError(null);

    if (connectorTypes.length === 0) {
      setError('Please select at least one connector type.');
      return;
    }

    const token = localStorage.getItem('voltsync_token');
    try {
      const response = await fetch(`${API_BASE_URL}/stations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name,
          latitude: Number(latitude),
          longitude: Number(longitude),
          chargerCount: Number(chargerCount),
          connectorTypes,
          chargingSpeedKw: Number(chargingSpeedKw),
          pricingPerKwh: Number(pricingPerKwh)
        })
      });

      const data = await response.json();

      if (response.ok) {
        setFormSuccess(`Station "${data.name}" registered successfully!`);
        // Reset form
        setName('');
        setLatitude('');
        setLongitude('');
        setConnectorTypes([]);
        // Refresh analytics
        fetchAnalytics();
      } else {
        setError(data.error || 'Failed to register station.');
      }
    } catch (err) {
      setError('Connection to backend failed.');
    }
  };

  const toggleConnector = (type) => {
    if (connectorTypes.includes(type)) {
      setConnectorTypes(connectorTypes.filter(c => c !== type));
    } else {
      setConnectorTypes([...connectorTypes, type]);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ border: '3px solid var(--bg-tertiary)', borderTop: '3px solid var(--accent-teal)', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  const { stationAnalytics = [], hotspots = [], summary = {} } = analytics || {};

  return (
    <div className="operator-layout">
      {/* Dashboard Top Section */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-header-title">
            Operator Dashboard
          </h1>
          <p className="dashboard-header-desc">
            Monitor infrastructure status, pricing, utilization, and network revenue.
          </p>
        </div>
        <div className="section-meta-badge">
          <ShieldCheck size={16} /> Updated just now
        </div>
      </div>

      {/* Hero Stat: Network Revenue (Breaks uniform card rhythm) */}
      <div className="stat-card-hero">
        <div>
          <span className="stat-hero-tag">
            Gross Network Revenue
          </span>
          <div className="stat-hero-value">
            ₹{Number(summary.totalRevenue || 0).toLocaleString()} <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-secondary)' }}>INR</span>
          </div>
          <p className="stat-hero-sub">
            Total aggregated revenue generated across all registered charging nodes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className="status-badge status-badge--amber" style={{ padding: '6px 14px', fontSize: '12px' }}>
            Real-time settlement
          </span>
        </div>
      </div>

      {/* Remaining 3 Summary Metrics in a 3-column row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Avg Utilization</span>
            <TrendingUp size={18} style={{ color: 'var(--accent-teal)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-teal)' }}>
            {summary.averageUtilization || 0}%
          </div>
          <span className="stat-subtitle">Based on booked vs total slot-hours</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Total Bookings</span>
            <Users size={18} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            {summary.totalBookings || 0}
          </div>
          <span className="stat-subtitle">Reserved slot transactions</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Active Stations</span>
            <Award size={18} style={{ color: 'var(--accent-orange)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-orange)' }}>
            {stationAnalytics.length}
          </div>
          <span className="stat-subtitle">Online nodes in network</span>
        </div>
      </div>

      {/* Main Analytics Content Row */}
      <div className="analytics-row">
        {/* Left Card: Chart and Station Details */}
        <div className="analytics-card">
          <div className="card-title-bar">
            <span>Station-wise Performance</span>
            <BarChart3 size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          
          {/* Custom SVG Bar Chart */}
          <div className="chart-container-box">
            {stationAnalytics.map((s, i) => {
              const heightPct = Math.max(10, Math.min(100, (s.revenue / (summary.totalRevenue || 1)) * 100));
              return (
                <div key={i} className="chart-column">
                  <span className="chart-revenue-tag">₹{s.revenue}</span>
                  <div
                    style={{
                      width: '32px',
                      height: `${heightPct}px`,
                      background: 'linear-gradient(to top, var(--accent-primary), var(--accent-teal))',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.5s ease'
                    }}
                  />
                  <span className="chart-label">
                    {s.stationName.split(' ')[1] || s.stationName}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Utilization List */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="table-header-grid">
              <span>Station Name</span>
              <span style={{ textAlign: 'right' }}>Util. %</span>
              <span style={{ textAlign: 'right' }}>Peak Hour</span>
              <span style={{ textAlign: 'right' }}>Cancel Rate</span>
            </div>
            {stationAnalytics.map((s, i) => (
              <div key={i} className="table-row-grid">
                <span style={{ fontWeight: 'bold' }}>{s.stationName}</span>
                <span style={{ textAlign: 'right', color: 'var(--accent-teal)', fontWeight: 'bold' }}>{s.utilizationRate}%</span>
                <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{s.peakHour}</span>
                <span style={{ textAlign: 'right', color: s.cancellationRate > 20 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>{s.cancellationRate}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Card: Hotspots & Register New Station */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Demand Hotspots Widget */}
          <div className="stat-card">
            <div className="card-title-bar" style={{ marginBottom: '12px' }}>
              <span>Demand Hotspots</span>
              <Sparkles size={16} style={{ color: 'var(--accent-orange)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {hotspots.slice(0, 3).map((h, i) => (
                <div key={i} className="hotspot-card-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hotspot-rank-badge">
                      {i + 1}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>{h.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent-teal)' }}>Score: {h.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Register New Station Form */}
          <div className="stat-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} style={{ color: 'var(--accent-teal)' }} /> Register New Node
            </h3>

            {formSuccess && (
              <div className="alert-box-success">
                {formSuccess}
              </div>
            )}

            {error && (
              <div className="alert-box-danger">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRegisterStation} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                placeholder="Station Name (e.g. Station E)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="search-input"
                style={{ padding: '10px 12px', height: '36px' }}
                required
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="number"
                  step="any"
                  placeholder="Lat (e.g. 12.9)"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="search-input"
                  style={{ padding: '10px 12px', height: '36px' }}
                  required
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Lng (e.g. 77.5)"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="search-input"
                  style={{ padding: '10px 12px', height: '36px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Chargers</label>
                  <input
                    type="number"
                    value={chargerCount}
                    onChange={(e) => setChargerCount(e.target.value)}
                    className="search-input"
                    style={{ padding: '10px 12px', height: '36px' }}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Speed (kW)</label>
                  <input
                    type="number"
                    value={chargingSpeedKw}
                    onChange={(e) => setChargingSpeedKw(e.target.value)}
                    className="search-input"
                    style={{ padding: '10px 12px', height: '36px' }}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Price (INR)</label>
                  <input
                    type="number"
                    value={pricingPerKwh}
                    onChange={(e) => setPricingPerKwh(e.target.value)}
                    className="search-input"
                    style={{ padding: '10px 12px', height: '36px' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Connector Types</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {['CCS', 'CHAdeMO', 'Type 2'].map(type => (
                    <label key={type} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={connectorTypes.includes(type)}
                        onChange={() => toggleConnector(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" className="action-btn" style={{ height: '38px', marginTop: '6px' }}>
                Register Station Node
              </button>
            </form>
          </div>

          {/* Live Charger Outlet Status Controls */}
          <div className="stat-card">
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} style={{ color: 'var(--accent-teal)' }} /> Live Charger Outlet Controls
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Simulate hardware telemetry. Change individual chargers between Free, Occupied, or Maintenance.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {stationsList.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No stations registered yet.
                </div>
              ) : (
                stationsList.map((st) => (
                  <div key={st._id} className="node-control-card">
                    <div className="node-control-header">
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-primary)' }}>{st.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--accent-teal)' }}>{st.chargingSpeedKw} kW Fast DC</span>
                    </div>
                    <div className="node-chargers-wrap">
                      {st.chargers?.map((c) => (
                        <div key={c.id} className="node-charger-badge">
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-teal)' }}>{c.id}:</span>
                          <select
                            value={c.status}
                            onChange={(e) => handleUpdateChargerStatus(st._id, c.id, e.target.value)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: c.status === 'free' ? 'var(--accent-green)' : c.status === 'occupied' ? 'var(--accent-red)' : 'var(--accent-orange)',
                              fontSize: '11px',
                              fontWeight: '600',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="free" style={{ background: 'var(--bg-secondary)', color: 'var(--accent-green)' }}>Free</option>
                            <option value="occupied" style={{ background: 'var(--bg-secondary)', color: 'var(--accent-red)' }}>Occupied</option>
                            <option value="maintenance" style={{ background: 'var(--bg-secondary)', color: 'var(--accent-orange)' }}>Maintenance</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperatorDashboard;
