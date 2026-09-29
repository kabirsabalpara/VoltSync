import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, ShieldCheck, CreditCard, CheckCircle, AlertTriangle, BatteryCharging, Car, QrCode, ArrowRight, Download, MapPin, Zap, Smartphone } from 'lucide-react';
import { API_BASE_URL } from '../config';
import PaymentGatewayModal from './PaymentGatewayModal';

const EV_MODELS = [
  { name: 'Tata Nexon EV Max', batteryKwh: 40.5, speedCapKw: 50 },
  { name: 'MG ZS EV Long Range', batteryKwh: 50.3, speedCapKw: 80 },
  { name: 'Hyundai Ioniq 5 Ultra', batteryKwh: 72.6, speedCapKw: 240 },
  { name: 'BYD Atto 3 Superior', batteryKwh: 60.4, speedCapKw: 80 },
  { name: 'Mahindra XUV400 EL', batteryKwh: 39.4, speedCapKw: 50 },
  { name: 'Standard EV (Generic)', batteryKwh: 45.0, speedCapKw: 100 }
];

const BookingFlow = ({ station, userEmail, onClose, onBookingSuccess }) => {
  const [step, setStep] = useState('slots'); // slots -> estimator -> payment -> success
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [chargerId, setChargerId] = useState(null);

  // EV Vehicle & Battery Estimator
  const [selectedEv, setSelectedEv] = useState(EV_MODELS[0]);
  const [startSoc, setStartSoc] = useState(20);
  const [targetSoc, setTargetSoc] = useState(80);

  // Payment Option
  const [paymentMethod, setPaymentMethod] = useState('upi'); // upi -> card -> wallet

  // Timer States
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef(null);

  // Redirection Recommendation
  const [redirectionRec, setRedirectionRec] = useState(null);

  // Fetch slots on open
  useEffect(() => {
    fetchSlots();
  }, [station._id]);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/stations/${station._id}/availability`);
      const data = await response.json();
      if (response.ok) {
        setSlots(data.slots || []);
      } else {
        setError(data.error || 'Failed to fetch slots.');
      }
    } catch (err) {
      setError('Error connecting to backend.');
    } finally {
      setLoading(false);
    }
  };

  // Timer logic
  useEffect(() => {
    if (step === 'payment' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setTimerExpired(true);
            setError('Time window to complete payment has expired. The slot has been released.');
            setStep('slots'); // Rollback
            setSelectedSlot(null);
            setBookingId(null);
            fetchSlots(); // refresh slots
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, timeLeft]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Calculate estimated charging time (minutes) and energy cost
  const socNeeded = Math.max(0, targetSoc - startSoc);
  const energyKwhNeeded = (selectedEv.batteryKwh * socNeeded) / 100;
  const effectiveSpeedKw = Math.min(station.chargingSpeedKw, selectedEv.speedCapKw);
  const estChargingMinutes = Math.round((energyKwhNeeded / effectiveSpeedKw) * 60);
  const totalCostInr = Math.round(energyKwhNeeded * station.pricingPerKwh);

  // 1. Lock Slot Step
  const handleLockSlot = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);
    setRedirectionRec(null);

    const token = localStorage.getItem('voltsync_token');
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          stationId: station._id,
          slotTime: selectedSlot.slotTime,
          userEmail
        })
      });

      const data = await response.json();

      if (response.status === 201) {
        setBookingId(data.bookingId);
        setChargerId(data.chargerId);
        setTimeLeft(300); // Reset to 5 mins
        setTimerExpired(false);
        setStep('payment');
      } else if (response.status === 409) {
        setError(data.error || 'This slot is already booked.');
        if (data.alternative) {
          setRedirectionRec(data.alternative);
        }
      } else {
        setError(data.error || 'Failed to reserve slot.');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Confirm Payment Step
  const handlePayment = async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('voltsync_token');
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bookingId,
          paymentIntentId: `pi_${paymentMethod}_${Math.random().toString(36).substr(2, 9)}`,
          energyKwh: energyKwhNeeded > 0 ? energyKwhNeeded : 10
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (timerRef.current) clearInterval(timerRef.current);
        setStep('success');
        if (onBookingSuccess) {
          onBookingSuccess(data.booking);
        }
      } else {
        setError(data.error || 'Payment confirmation failed.');
      }
    } catch (err) {
      setError('Failed to contact server for payment confirmation.');
    } finally {
      setLoading(false);
    }
  };

  // Release lock if closed manually during payment
  const handleClose = async () => {
    if (step === 'payment' && bookingId) {
      const token = localStorage.getItem('voltsync_token');
      fetch(`${API_BASE_URL}/bookings/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ bookingId })
      }).catch(() => {});
    }
    onClose();
  };

  const formatSlotTime = (isoString) => {
    const d = new Date(isoString);
    const startHour = d.getHours();
    const endHour = (startHour + 1) % 24;
    return `${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00`;
  };

  const ticketRef = `VS-${station.name.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // STEP 2: FULL PAYMENT GATEWAY (UPI QR, Cards with 3D Secure, Netbanking, EV Wallet)
  if (step === 'payment') {
    return (
      <PaymentGatewayModal
        station={station}
        bookingId={bookingId}
        chargerId={chargerId}
        slotTime={selectedSlot?.slotTime}
        energyKwh={energyKwhNeeded}
        userEmail={userEmail}
        onClose={handleClose}
        onPaymentSuccess={(confirmedBooking) => {
          if (timerRef.current) clearInterval(timerRef.current);
          setStep('success');
          if (onBookingSuccess) {
            onBookingSuccess(confirmedBooking);
          }
        }}
      />
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content glass" style={{ width: step === 'success' ? '560px' : '520px' }}>
        <button onClick={handleClose} className="close-modal-btn">
          <X size={22} />
        </button>

        {/* STEP 1: SELECT SLOTS & ESTIMATOR */}
        {step === 'slots' && (
          <div>
            <div className="dialog-header">
              <Zap size={22} style={{ color: 'var(--accent-primary)' }} />
              <h2 className="dialog-title">
                Reserve Charger Slot
              </h2>
            </div>
            <p className="dialog-subtitle">
              <b>{station.name}</b> ({station.chargingSpeedKw} kW Fast Charge)
            </p>

            {error && (
              <div className="alert-box-danger">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Smart Redirection Alert inside Modal */}
            {redirectionRec && (
              <div className="recommendation-banner" style={{ marginTop: '0', marginBottom: '16px' }}>
                <div className="recommendation-title">
                  <AlertTriangle size={16} /> Station Fully Occupied! Recommended Alternate:
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{redirectionRec.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Speed: {redirectionRec.chargingSpeedKw} kW | Price: {redirectionRec.pricingPerKwh} INR/kWh
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--accent-teal)', fontWeight: 'bold', fontSize: '12px' }}>{redirectionRec.distance} km away</div>
                    <div style={{ color: 'var(--accent-green)', fontSize: '11px' }}>{redirectionRec.freeChargers} Free Chargers</div>
                  </div>
                </div>
              </div>
            )}

            {/* EV Model Estimator Collapsible / Selector */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-teal)' }}>
                  <Car size={14} /> EV Model & Battery Estimator
                </span>
                <span style={{ fontSize: '11px', color: 'var(--accent-green)', fontWeight: 'bold' }}>
                  ~{estChargingMinutes} mins session (₹{totalCostInr})
                </span>
              </div>

              {/* EV Model Grid */}
              <div className="ev-model-grid">
                {EV_MODELS.map((ev, idx) => (
                  <div
                    key={idx}
                    className={`ev-model-chip ${selectedEv.name === ev.name ? 'selected' : ''}`}
                    onClick={() => setSelectedEv(ev)}
                  >
                    {ev.name.split(' ')[0]} {ev.name.split(' ')[1]}
                  </div>
                ))}
              </div>

              {/* Charge Range Sliders */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '10px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div style={{ flex: 1 }}>
                  <span>Current Battery: <b>{startSoc}%</b></span>
                  <input
                    type="range"
                    min="5"
                    max="80"
                    value={startSoc}
                    onChange={(e) => setStartSoc(Number(e.target.value))}
                    style={{ width: '100%', marginTop: '4px', accentColor: 'var(--accent-primary)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span>Target Battery: <b>{targetSoc}%</b></span>
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={targetSoc}
                    onChange={(e) => setTargetSoc(Number(e.target.value))}
                    style={{ width: '100%', marginTop: '4px', accentColor: 'var(--accent-green)' }}
                  />
                </div>
              </div>
            </div>

            {/* Time Slot Selection */}
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} style={{ color: 'var(--accent-blue)' }} /> Select 1-Hour Time Window:
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
                <div style={{ border: '3px solid var(--bg-tertiary)', borderTop: '3px solid var(--accent-teal)', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite' }}></div>
              </div>
            ) : (
              <div className="slot-grid">
                {slots.map((slot, index) => (
                  <button
                    key={index}
                    disabled={slot.isFullyBooked}
                    onClick={() => setSelectedSlot(slot)}
                    className={`slot-btn ${selectedSlot && selectedSlot.slotTime === slot.slotTime ? 'selected' : ''}`}
                  >
                    <span className="slot-time-text">{formatSlotTime(slot.slotTime)}</span>
                    <span className="slot-avail-text" style={{ color: slot.isFullyBooked ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {slot.isFullyBooked ? 'Fully Booked' : `${slot.availableCount} chargers available`}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleLockSlot}
              disabled={!selectedSlot || loading}
              className="action-btn"
              style={{ marginTop: '16px' }}
            >
              Lock Selected Slot & Proceed <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* STEP 2: PAYMENT GATEWAY SELECTION */}
        {step === 'payment' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Checkout & Reservation Lock
              </h2>
              <div className="timer-container" style={{ margin: 0, padding: '4px 10px', fontSize: '12px' }}>
                <Clock size={14} /> {formatTimer(timeLeft)}
              </div>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Charger outlet <b>{chargerId}</b> is locked for you. Complete payment before hold timer expires.
            </p>

            <div className="payment-sandbox">
              <div className="sandbox-alert" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} /> Payment simulation — no real charge will be made
              </div>

              {/* Order Summary Table */}
              <div className="order-summary-box">
                <div className="order-summary-row">
                  <span>Station Location:</span>
                  <b style={{ color: 'var(--text-primary)' }}>{station.name}</b>
                </div>
                <div className="order-summary-row">
                  <span>Assigned Charger Outlet:</span>
                  <b style={{ color: 'var(--accent-teal)' }}>{chargerId} (Fast DC)</b>
                </div>
                <div className="order-summary-row">
                  <span>Vehicle Model:</span>
                  <b style={{ color: 'var(--text-primary)' }}>{selectedEv.name}</b>
                </div>
                <div className="order-summary-row">
                  <span>Reserved Slot:</span>
                  <b style={{ color: 'var(--text-primary)' }}>{formatSlotTime(selectedSlot.slotTime)}</b>
                </div>
                <div className="order-summary-total">
                  <span style={{ color: 'var(--text-primary)' }}>Total Payable Amount:</span>
                  <span style={{ color: 'var(--accent-green)' }}>
                    ₹{totalCostInr} INR
                  </span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Select Payment Mode:
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[
                  { id: 'upi', label: 'UPI / QR', icon: Smartphone },
                  { id: 'card', label: 'Card Payment', icon: CreditCard },
                  { id: 'wallet', label: 'VoltSync Wallet', icon: Zap }
                ].map((pm) => {
                  const Icon = pm.icon;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`option-pill ${paymentMethod === pm.id ? 'selected' : ''}`}
                    >
                      <Icon size={14} />
                      {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="alert-box-danger">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleClose}
                className="nav-btn"
                style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center' }}
              >
                Cancel Hold
              </button>
              <button
                onClick={handlePayment}
                disabled={loading}
                className="action-btn"
                style={{ flex: 2 }}
              >
                <CreditCard size={16} /> Pay ₹{totalCostInr} & Confirm Pass
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DIGITAL CHARGING TICKET PASS */}
        {step === 'success' && (
          <div style={{ padding: '10px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'inline-flex', background: 'rgba(52, 211, 153, 0.15)', border: '2px solid var(--accent-green)', borderRadius: '50%', padding: '12px', color: 'var(--accent-green)', marginBottom: '8px' }}>
                <CheckCircle size={36} />
              </div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Reservation Confirmed!
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Your EV charging slot is locked and paid. Show this digital pass at the station.
              </p>
            </div>

            {/* Futuristic Digital Charging Pass Ticket */}
            <div className="ticket-pass">
              <div className="ticket-header">
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff' }}>VoltSync FastPass</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Official EV Charging Pass</div>
                </div>
                <div className="ticket-ref">{ticketRef}</div>
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {/* Details Grid */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>CHARGING STATION</span>
                    <b style={{ color: '#fff', fontSize: '14px' }}>{station.name}</b>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>CHARGER OUTLET</span>
                      <b style={{ color: 'var(--accent-teal)' }}>{chargerId}</b>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>MAX SPEED</span>
                      <b style={{ color: '#fff' }}>{station.chargingSpeedKw} kW</b>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>RESERVED TIME SLOT</span>
                    <b style={{ color: 'var(--accent-green)' }}>{formatSlotTime(selectedSlot?.slotTime)}</b>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>DRIVER EMAIL</span>
                    <b style={{ color: '#fff' }}>{userEmail}</b>
                  </div>
                </div>

                {/* Scannable Check-in QR Pass */}
                <div className="qr-placeholder">
                  <QrCode size={70} style={{ color: '#0a0f1d' }} />
                  <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#0a0f1d', marginTop: '4px', textAlign: 'center', lineHeight: 1.2 }}>
                    Show this pass at the charger
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  const destLat = station.location.coordinates[1];
                  const destLng = station.location.coordinates[0];
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`, '_blank');
                }}
                className="nav-btn"
                style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center', height: '40px', fontSize: '13px' }}
              >
                <MapPin size={16} /> Open Maps Navigation
              </button>
              <button onClick={handleClose} className="action-btn" style={{ flex: 1, height: '40px', fontSize: '13px' }}>
                Done & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingFlow;

