import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, Phone, Car, Zap, BarChart3, CheckCircle, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { API_BASE_URL } from '../config';

const EV_MODELS = [
  'Tata Nexon EV Max',
  'MG ZS EV Long Range',
  'Hyundai Ioniq 5 Ultra',
  'BYD Atto 3 Superior',
  'Mahindra XUV400 EL',
  'Other / Generic EV'
];

const AuthModal = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [evModel, setEvModel] = useState(EV_MODELS[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const endpoint = mode === 'signup' ? `${API_BASE_URL}/auth/signup` : `${API_BASE_URL}/auth/login`;
    const payload = mode === 'signup' 
      ? { name, email, password, phone, evModel }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMsg(data.message || 'Authenticated successfully!');
        if (onAuthSuccess) {
          onAuthSuccess(data.user, data.token);
        }
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setError(data.error || 'Authentication failed. Please check details.');
      }
    } catch (err) {
      setError('Failed to connect to backend server.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = (demoRole) => {
    if (demoRole === 'driver') {
      setEmail('driver@example.com');
      setPassword('driver123');
    } else {
      setEmail('operator@example.com');
      setPassword('operator123');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass" style={{ width: '460px', padding: '30px' }}>
        <button onClick={onClose} className="close-modal-btn">
          <X size={22} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(245, 166, 35, 0.15)', border: '1px solid rgba(245, 166, 35, 0.3)', borderRadius: '50%', padding: '12px', color: 'var(--accent-primary)', marginBottom: '8px' }}>
            <Zap size={28} />
          </div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            {mode === 'login' ? 'Sign in to access your EV reservations and charging history.' : 'Join VoltSync EV network to reserve fast chargers.'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '4px', marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'login' ? 'var(--accent-primary)' : 'transparent',
              color: mode === 'login' ? '#0d1210' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'signup' ? 'var(--accent-primary)' : 'transparent',
              color: mode === 'signup' ? '#0d1210' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', color: 'var(--accent-red)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(56, 239, 125, 0.1)', border: '1px solid rgba(56, 239, 125, 0.3)', color: 'var(--accent-green)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {mode === 'signup' && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                Full Name
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0 12px', height: '40px' }}>
                <UserIcon size={16} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Alex Sharma"
                  style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', width: '100%', outline: 'none' }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
              Email Address
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0 12px', height: '40px' }}>
              <Mail size={16} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="e.g. driver@example.com"
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', width: '100%', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
              Password
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0 12px', height: '40px' }}>
              <Lock size={16} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', width: '100%', outline: 'none' }}
              />
            </div>
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  EV Vehicle Model
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0 12px', height: '40px' }}>
                  <Car size={16} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                  <select
                    value={evModel}
                    onChange={(e) => setEvModel(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', width: '100%', outline: 'none', cursor: 'pointer' }}
                  >
                    {EV_MODELS.map((model, i) => (
                      <option key={i} value={model} style={{ background: 'var(--bg-secondary)', color: '#fff' }}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="action-btn"
            style={{ marginTop: '10px', height: '42px' }}
          >
            {loading ? 'Processing...' : mode === 'login' ? 'Log In to Account' : 'Register Account'} <ArrowRight size={16} />
          </button>
        </form>

        {/* Quick Demo Shortcuts */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--glass-border)', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Demo Quick Login Shortcuts:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('driver')}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Zap size={14} /> Fill Driver Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('operator')}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <BarChart3 size={14} /> Fill Operator Demo
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AuthModal;
