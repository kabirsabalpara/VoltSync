import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, ShieldCheck, CreditCard, CheckCircle, AlertTriangle, BatteryCharging, Car, QrCode, ArrowRight, Download, MapPin, Zap, Smartphone } from 'lucide-react';
import { API_BASE_URL } from '../config';
import PaymentGatewayModal from './PaymentGatewayModal';
import QRCodeView from './QRCodeView';

const EV_MODELS = [
  { name: 'Tata Nexon EV Max', batteryKwh: 40.5, speedCapKw: 50 },
  { name: 'MG ZS EV Long Range', batteryKwh: 50.3, speedCapKw: 80 },
  { name: 'Hyundai Ioniq 5 Ultra', batteryKwh: 72.6, speedCapKw: 240 },
  { name: 'BYD Atto 3 Superior', batteryKwh: 60.4, speedCapKw: 80 },
  { name: 'Mahindra XUV400 EL', batteryKwh: 39.4, speedCapKw: 50 },
  { name: 'Standard EV (Generic)', batteryKwh: 45.0, speedCapKw: 100 }
];

const generateDynamicSlots = (station) => {
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const generated = [];
  const chargerList = (station?.chargers && station.chargers.length > 0)
    ? station.chargers.map((c, i) => (typeof c === 'string' ? c : (c.id || `C${i + 1}`)))
    : ['C1', 'C2', 'C3', 'C4'];

  for (let i = 0; i < 8; i++) {
    const slotTime = new Date(currentHour.getTime() + i * 60 * 60 * 1000);
    generated.push({
      slotTime: slotTime.toISOString(),
      totalChargers: chargerList.length,
      availableCount: Math.max(1, chargerList.length - (i % 2)),
      availableChargerIds: chargerList,
      isFullyBooked: false
    });
  }
  return generated;
};

const BookingFlow = ({ station, userEmail, onClose, onBookingSuccess }) => {
  const initialSlots = generateDynamicSlots(station);
  const [step, setStep] = useState('slots'); // slots -> estimator -> payment -> success
  const [slots, setSlots] = useState(initialSlots);
  const [selectedSlot, setSelectedSlot] = useState(initialSlots[0] || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [chargerId, setChargerId] = useState(null);
  const [confirmedBookingData, setConfirmedBookingData] = useState(null);

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

  // Fetch live slot availability on open (background sync)
  useEffect(() => {
    fetchSlots();
  }, [station._id]);

  const fetchSlots = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/stations/${station._id}/availability`);
      const data = await response.json();
      if (response.ok && data.slots && data.slots.length > 0) {
        setSlots(data.slots);
        if (!selectedSlot || !data.slots.some(s => s.slotTime === selectedSlot.slotTime && !s.isFullyBooked)) {
          const firstAvail = data.slots.find(s => !s.isFullyBooked) || data.slots[0];
          setSelectedSlot(firstAvail);
        }
      }
    } catch (err) {
      console.warn('Live slot sync deferred, using instant dynamic slots:', err);
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
    if (!token) {
      setError('Please sign in or register (top right) before reserving a charger slot.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/bookings/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
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
        setError(data.error || 'Failed to reserve slot. Please try another slot or station.');
      }
    } catch (err) {
      setError(err.message || 'Payment service unavailable or network error. Please select another slot.');
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
        lockedUntil={new Date(Date.now() + 300000).toISOString()}
        onClose={handleClose}
        onPaymentSuccess={(confirmedBooking) => {
          if (timerRef.current) clearInterval(timerRef.current);
          setConfirmedBookingData(confirmedBooking);
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
        <button onClick={handleClose} className="close-modal-btn" title="Close">
          <X size={20} />
        </button>

        {/* STEP 1: SELECT SLOTS & ESTIMATOR */}
        {step === 'slots' && (
          <>
            <div className="modal-header">
              <div className="dialog-header">
                <Zap size={22} style={{ color: 'var(--accent-primary)' }} />
                <h2 className="dialog-title" style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>
                  Reserve Charger Slot
                </h2>
              </div>
              <p className="dialog-subtitle" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                <b>{station.name}</b> ({station.chargingSpeedKw} kW Fast Charge)
              </p>
            </div>

            <div className="modal-body">
              {error && (
                <div className="alert-box-danger" style={{ marginBottom: '14px' }}>
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* Smart Redirection Alert inside Modal */}
              {redirectionRec && (
                <div className="recommendation-banner" style={{ marginTop: '0', marginBottom: '14px' }}>
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
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-teal)' }}>
                    <Car size={14} /> EV Model & Battery Estimator
                  </span>
                  <span style={{ fontSize: '11px', color: '#047857', fontWeight: 'bold' }}>
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
                      style={{ width: '100%', marginTop: '4px', accentColor: '#059669' }}
                    />
                  </div>
                </div>
              </div>

              {/* Time Slot Selection */}
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} style={{ color: 'var(--accent-blue)' }} /> Select 1-Hour Time Window:
                </span>
                <span style={{ fontSize: '11px', color: '#047857', fontWeight: '600' }}>
                  ● Real-Time Slots
                </span>
              </div>

              <div className="slot-grid">
                {(slots && slots.length > 0 ? slots : generateDynamicSlots(station)).map((slot, index) => {
                  const isSelected = selectedSlot && selectedSlot.slotTime === slot.slotTime;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={slot.isFullyBooked}
                      onClick={() => setSelectedSlot(slot)}
                      className={`slot-btn ${isSelected ? 'selected' : ''}`}
                    >
                      <span className="slot-time-text">{formatSlotTime(slot.slotTime)}</span>
                      <span 
                        className="slot-avail-text" 
                        style={{ color: slot.isFullyBooked ? 'var(--accent-red)' : '#059669' }}
                      >
                        {slot.isFullyBooked ? 'Fully Booked' : `${slot.availableCount} chargers available`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={handleLockSlot}
                disabled={!selectedSlot || loading}
                className="action-btn"
                style={{ width: '100%', height: '46px', fontSize: '14px', gap: '8px' }}
              >
                {loading ? 'Locking Slot...' : 'Lock Selected Slot & Proceed'} <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {/* STEP 3: DIGITAL CHARGING TICKET PASS */}
        {step === 'success' && (
          <>
            <div className="modal-header" style={{ textAlign: 'center', paddingBottom: '12px' }}>
              <div style={{ display: 'inline-flex', background: 'rgba(16, 185, 129, 0.12)', border: '2px solid #10b981', borderRadius: '50%', padding: '10px', color: '#10b981', marginBottom: '8px' }}>
                <CheckCircle size={32} />
              </div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Reservation Confirmed!
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Your EV charging slot is locked and paid. Show this digital pass at the station.
              </p>
            </div>

            <div className="modal-body">
              <div className="ticket-pass">
                <div className="ticket-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>VoltSync FastPass</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Official EV Charging Pass</div>
                  </div>
                  <div className="ticket-ref">{ticketRef}</div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>CHARGING STATION</span>
                      <b style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{station.name}</b>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>CHARGER OUTLET</span>
                        <b style={{ color: 'var(--accent-teal)' }}>{chargerId}</b>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>MAX SPEED</span>
                        <b style={{ color: 'var(--text-primary)' }}>{station.chargingSpeedKw} kW</b>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>RESERVED TIME SLOT</span>
                      <b style={{ color: '#047857' }}>{formatSlotTime(selectedSlot?.slotTime)}</b>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>DRIVER EMAIL</span>
                      <b style={{ color: 'var(--text-primary)' }}>{userEmail}</b>
                    </div>
                  </div>

                  <div className="qr-placeholder" style={{ padding: '8px', background: '#ffffff', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                    <QRCodeView
                      value={`${window.location.origin}/checkin/${confirmedBookingData?.qrToken || confirmedBookingData?._id || bookingId}`}
                      size={88}
                    />
                    <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#0a0f1d', marginTop: '4px', textAlign: 'center', lineHeight: 1.2 }}>
                      Scan to Start Charging
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  const destLat = station.location.coordinates[1];
                  const destLng = station.location.coordinates[0];
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`, '_blank');
                }}
                className="nav-btn"
                style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center', height: '42px', fontSize: '13px' }}
              >
                <MapPin size={16} /> Open Maps Navigation
              </button>
              <button onClick={handleClose} className="action-btn" style={{ flex: 1, height: '42px', fontSize: '13px' }}>
                Done & Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BookingFlow;

