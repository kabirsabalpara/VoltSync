import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  Sparkles, 
  AlertCircle, 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Award,
  Edit2,
  Check,
  X,
  QrCode,
  CheckCircle,
  RefreshCw,
  Clock
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const OperatorDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stationsList, setStationsList] = useState([]);

  // FastPass Check-In Verification State
  const [checkInInput, setCheckInInput] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInResult, setCheckInResult] = useState(null);
  const [checkInError, setCheckInError] = useState(null);

  // New Station Form States
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [chargerCount, setChargerCount] = useState(4);
  const [connectorTypes, setConnectorTypes] = useState(['CCS', 'Type 2']);
  const [chargingSpeedKw, setChargingSpeedKw] = useState(60);
  const [pricingPerKwh, setPricingPerKwh] = useState(16);
  const [formSuccess, setFormSuccess] = useState(null);

  // Editing Station State
  const [editingStation, setEditingStation] = useState(null);
  const [editPrice, setEditPrice] = useState(16);
  const [editSpeed, setEditSpeed] = useState(60);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('voltsync_token');
      const authHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const [analyticsRes, stationsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/stations/operator/analytics`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/stations/operator/my-stations`, { headers: authHeaders })
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
      setError('Connection to backend failed.');
    } finally {
      setLoading(false);
    }
  };

  // FastPass QR / Code Verification Workflow
  const handleVerifyCheckIn = async (e) => {
    e.preventDefault();
    if (!checkInInput.trim()) return;

    setCheckInLoading(true);
    setCheckInResult(null);
    setCheckInError(null);

    const token = localStorage.getItem('voltsync_token');
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          checkInCode: checkInInput.trim().toUpperCase()
        })
      });

      const data = await response.json();
      if (response.ok) {
        setCheckInResult(data.booking);
        setCheckInInput('');
        fetchAnalytics(); // Refresh live metrics
      } else {
        setCheckInError(data.error || 'Check-in validation failed.');
      }
    } catch (err) {
      setCheckInError('Network error verifying check-in pass.');
    } finally {
      setCheckInLoading(false);
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
        setError(data.error || 'Failed to update charger status.');
      }
    } catch (err) {
      console.error('Error updating charger status:', err);
    }
  };

  const handleSaveStationEdit = async (stationId) => {
    try {
      const token = localStorage.getItem('voltsync_token');
      const response = await fetch(`${API_BASE_URL}/stations/${stationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          pricingPerKwh: Number(editPrice),
          chargingSpeedKw: Number(editSpeed)
        })
      });

      if (response.ok) {
        setEditingStation(null);
        fetchAnalytics();
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to update station settings.');
      }
    } catch (err) {
      setError('Failed to save station modifications.');
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
        setFormSuccess(`Station "${data.name}" registered under your operator account!`);
        setName('');
        setLatitude('');
        setLongitude('');
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '12px' }}>
        <div style={{ border: '3px solid var(--bg-tertiary)', borderTop: '3px solid var(--accent-primary)', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }}></div>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading Operator Infrastructure Telemetry...</span>
      </div>
    );
  }

  const { stationAnalytics = [], hotspots = [], summary = {} } = analytics || {};

  return (
    <div className="operator-layout">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-header-title">
            Operator Management Center
          </h1>
          <p className="dashboard-header-desc">
            Manage your network charging hubs, pricing rules, live hardware status, and FastPass check-ins.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            onClick={fetchAnalytics}
            className="nav-btn"
            style={{ padding: '6px 12px', fontSize: '12px', height: '34px', gap: '6px', border: '1px solid var(--border-subtle)' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <div className="section-meta-badge">
            <ShieldCheck size={16} /> Authenticated Operator
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Verified Revenue</span>
            <DollarSign size={18} style={{ color: 'var(--accent-green)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
            ₹{Number(summary.totalRevenue || 0).toLocaleString()}
          </div>
          <span className="stat-subtitle">From completed charging sessions</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Average Utilization</span>
            <TrendingUp size={18} style={{ color: 'var(--accent-teal)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-teal)' }}>
            {summary.averageUtilization || 0}%
          </div>
          <span className="stat-subtitle">Capacity ratio across your chargers</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Total Bookings</span>
            <Users size={18} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            {summary.totalBookings || 0}
          </div>
          <span className="stat-subtitle">Total reservations processed</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Managed Stations</span>
            <Award size={18} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>
            {stationsList.length}
          </div>
          <span className="stat-subtitle">Active nodes in your network</span>
        </div>
      </div>

      {/* FASTPASS CHECK-IN WORKFLOW BOX */}
      <div className="stat-card" style={{ marginBottom: '24px', background: 'rgba(245, 166, 35, 0.04)', border: '1px solid rgba(245, 166, 35, 0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              FastPass Check-In Verification
            </h3>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            On-site Session Validation Engine
          </span>
        </div>

        <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Enter or scan a driver's unique FastPass check-in code (e.g. <code>VP-A1B2C3D4</code>) to verify reservation authenticity.
        </p>

        <form onSubmit={handleVerifyCheckIn} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Enter FastPass Code (e.g. VP-38AF847D or VS-REF)"
            value={checkInInput}
            onChange={(e) => setCheckInInput(e.target.value)}
            className="search-input"
            style={{ flex: 1, minWidth: '220px', height: '40px', padding: '0 12px', fontSize: '13px' }}
          />
          <button
            type="submit"
            disabled={checkInLoading || !checkInInput.trim()}
            className="action-btn"
            style={{ height: '40px', padding: '0 20px', fontSize: '13px' }}
          >
            {checkInLoading ? 'Verifying...' : 'Validate & Check In'}
          </button>
        </form>

        {checkInError && (
          <div className="alert-box-danger" style={{ marginTop: '12px' }}>
            <AlertCircle size={16} />
            <span>{checkInError}</span>
          </div>
        )}

        {checkInResult && (
          <div style={{ marginTop: '12px', background: 'rgba(56, 239, 125, 0.1)', border: '1px solid rgba(56, 239, 125, 0.3)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={22} style={{ color: 'var(--accent-green)' }} />
              <div>
                <b style={{ color: 'var(--text-primary)', fontSize: '13px', display: 'block' }}>
                  Check-In Verified: {checkInResult.driverEmail}
                </b>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Station: {checkInResult.stationName} • Charger: {checkInResult.chargerId} • Ref: {checkInResult.reference}
                </span>
              </div>
            </div>
            <span style={{ background: 'var(--accent-green)', color: '#000', fontWeight: 'bold', fontSize: '11px', padding: '4px 10px', borderRadius: '4px' }}>
              STATUS: COMPLETED
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Station Management & Register Node */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        
        {/* Left Column: Managed Stations List with Live Outlet Controls & Pricing Editor */}
        <div className="stat-card">
          <div className="card-title-bar" style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800 }}>Managed Charging Nodes & Pricing</span>
            <ShieldCheck size={18} style={{ color: 'var(--accent-teal)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '550px', overflowY: 'auto', paddingRight: '4px' }}>
            {stationsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No stations currently registered under your account. Register a station node below to get started.
              </div>
            ) : (
              stationsList.map((st) => (
                <div key={st._id} className="node-control-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <b style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>{st.name}</b>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {st.chargingSpeedKw} kW Fast DC • Rate: ₹{st.pricingPerKwh}/kWh
                      </span>
                    </div>

                    {editingStation === st._id ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleSaveStationEdit(st._id)}
                          className="nav-btn"
                          style={{ padding: '4px 8px', fontSize: '11px', height: '28px', color: 'var(--accent-green)' }}
                          title="Save changes"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingStation(null)}
                          className="nav-btn"
                          style={{ padding: '4px 8px', fontSize: '11px', height: '28px', color: 'var(--accent-red)' }}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingStation(st._id);
                          setEditPrice(st.pricingPerKwh);
                          setEditSpeed(st.chargingSpeedKw);
                        }}
                        className="nav-btn"
                        style={{ padding: '4px 8px', fontSize: '11px', height: '28px', gap: '4px' }}
                      >
                        <Edit2 size={12} /> Edit Rules
                      </button>
                    )}
                  </div>

                  {/* Inline Pricing & Speed Editor */}
                  {editingStation === st._id && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '10px', display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>Rate (₹/kWh)</label>
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="search-input"
                          style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>Speed (kW)</label>
                        <input
                          type="number"
                          value={editSpeed}
                          onChange={(e) => setEditSpeed(e.target.value)}
                          className="search-input"
                          style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Charger Outlets Selector */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {st.chargers?.map((c) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '4px 8px', gap: '6px' }}>
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
                          <option value="free" style={{ background: '#0f172a', color: 'var(--accent-green)' }}>Free</option>
                          <option value="occupied" style={{ background: '#0f172a', color: 'var(--accent-red)' }}>Occupied</option>
                          <option value="maintenance" style={{ background: '#0f172a', color: 'var(--accent-orange)' }}>Maintenance</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Register New Station Node */}
        <div className="stat-card">
          <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} style={{ color: 'var(--accent-teal)' }} /> Register New Charging Node
          </h3>

          {formSuccess && (
            <div className="alert-box-success" style={{ marginBottom: '12px' }}>
              {formSuccess}
            </div>
          )}

          {error && (
            <div className="alert-box-danger" style={{ marginBottom: '12px' }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegisterStation} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              placeholder="Station Name (e.g. Tata Power EZ - Adajan Hub)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="search-input"
              style={{ padding: '0 12px', height: '38px', fontSize: '13px' }}
              required
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                step="any"
                placeholder="Latitude (e.g. 21.195)"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="search-input"
                style={{ padding: '0 12px', height: '38px', fontSize: '13px' }}
                required
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude (e.g. 72.812)"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="search-input"
                style={{ padding: '0 12px', height: '38px', fontSize: '13px' }}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Charger Outlets</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={chargerCount}
                  onChange={(e) => setChargerCount(e.target.value)}
                  className="search-input"
                  style={{ padding: '0 12px', height: '38px', fontSize: '13px' }}
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
                  style={{ padding: '0 12px', height: '38px', fontSize: '13px' }}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Rate (₹/kWh)</label>
                <input
                  type="number"
                  value={pricingPerKwh}
                  onChange={(e) => setPricingPerKwh(e.target.value)}
                  className="search-input"
                  style={{ padding: '0 12px', height: '38px', fontSize: '13px' }}
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label">Supported Connector Types</label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                {['CCS', 'CHAdeMO', 'Type 2'].map(type => (
                  <label key={type} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={connectorTypes.includes(type)}
                      onChange={() => toggleConnector(type)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" className="action-btn" style={{ height: '40px', marginTop: '8px' }}>
              Register Station Node
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default OperatorDashboard;
