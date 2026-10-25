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
  const [chargerId, setChargerId] = useState(null);
  const [selectedChargerId, setSelectedChargerId] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [confirmedBookingData, setConfirmedBookingData] = useState(null);
  const [existingHold, setExistingHold] = useState(null);
  const [releasingHold, setReleasingHold] = useState(false);

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

  // Derive chargers list for the currently selected slot (cinema-seat paradigm)
  const currentSlotChargers = React.useMemo(() => {
    if (selectedSlot?.chargers && selectedSlot.chargers.length > 0) {
      return selectedSlot.chargers;
    }
    return (station?.chargers || []).map((c, i) => ({
      id: typeof c === 'string' ? c : (c.id || `C${i + 1}`),
      status: (typeof c === 'object' && c.status === 'maintenance') ? 'MAINTENANCE' : 'AVAILABLE'
    }));
  }, [selectedSlot, station]);

  // Sync selected charger with an available one for current slot (or keep user's held charger)
  useEffect(() => {
    if (currentSlotChargers && currentSlotChargers.length > 0) {
      const isCurrentValid = selectedChargerId && currentSlotChargers.some(c => 
        c.id === selectedChargerId && (c.status === 'AVAILABLE' || (existingHold && existingHold.chargerId === selectedChargerId))
      );
      if (!isCurrentValid) {
        const firstAvailable = currentSlotChargers.find(c => c.status === 'AVAILABLE');
        setSelectedChargerId(firstAvailable ? firstAvailable.id : null);
      }
    }
  }, [currentSlotChargers, selectedChargerId, existingHold]);

  // Fetch live slot availability on open (background sync)
  useEffect(() => {
    fetchSlots();
  }, [station._id]);

  // Light polling while slot selector is open to keep cinema-seat availability fresh
  useEffect(() => {
    if (step === 'slots') {
      const poll = setInterval(() => {
        fetchSlots();
      }, 10000);
      return () => clearInterval(poll);
    }
  }, [step, station._id]);

  const fetchSlots = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/stations/${station._id}/availability`);
      const data = await response.json();
      if (response.ok && data.slots && data.slots.length > 0) {
        setSlots(data.slots);
        if (!selectedSlot || !data.slots.some(s => s.slotTime === selectedSlot.slotTime && !s.isFullyBooked)) {
          const firstAvail = data.slots.find(s => !s.isFullyBooked) || data.slots[0];
          setSelectedSlot(firstAvail);
        } else {
          // Update selectedSlot reference to maintain up-to-date charger statuses
          const updatedSelected = data.slots.find(s => s.slotTime === selectedSlot.slotTime);
          if (updatedSelected) {
            setSelectedSlot(updatedSelected);
          }
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
    if (!selectedSlot || !selectedChargerId) {
      setError('Please select an available charger before proceeding.');
      return;
    }
    setLoading(true);
    setError(null);
    setRedirectionRec(null);

    const token = localStorage.getItem('voltsync_token');
    if (!token) {
      setError('Your login session has expired. Please sign in again.');
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
          chargerId: selectedChargerId,
          energyKwh: energyKwhNeeded,
          userEmail
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 201) {
        setExistingHold(null);
        setError(null);
        setBookingId(data.bookingId);
        setChargerId(data.chargerId);
        setLockedUntil(data.lockedUntil);
        const serverSeconds = data.lockedUntil 
          ? Math.max(0, Math.floor((new Date(data.lockedUntil).getTime() - Date.now()) / 1000)) 
          : 300;
        setTimeLeft(serverSeconds);
        setTimerExpired(false);
        setStep('payment');
      } else if (response.status === 401) {
        setExistingHold(null);
        setError('Your login session has expired. Please sign in again.');
      } else if (response.status === 409) {
        fetchSlots(); // Refresh live availability
        if (data.existingHold) {
          setExistingHold(data.existingHold);
          setError(null); // The hold action banner will explain clearly
        } else {
          setExistingHold(null);
          if (data.error && data.error.includes('already have a reservation')) {
            setError('You already have a confirmed reservation during this time slot.');
          } else {
            setError(data.error || 'This charger has just been reserved. Please select another charger.');
          }
          if (data.alternative) {
            setRedirectionRec(data.alternative);
          }
        }
      } else if (response.status === 400) {
        setExistingHold(null);
        setError(data.error || 'Invalid booking request. Please check your selections.');
      } else {
        setExistingHold(null);
        setError(data.error || 'Unable to reserve this charger right now. Please try again.');
      }
    } catch (err) {
      setExistingHold(null);
      setError('Unable to reserve this charger right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Continue checkout using existing server hold
  const handleContinueExistingHold = () => {
    if (!existingHold) return;
    const remainingSeconds = Math.max(0, Math.floor((new Date(existingHold.lockedUntil).getTime() - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      setError('Your reservation hold has expired. Please select a charger to reserve again.');
      setExistingHold(null);
      fetchSlots();
      return;
    }
    setBookingId(existingHold.bookingId);
    setChargerId(existingHold.chargerId);
    setSelectedChargerId(existingHold.chargerId);
    setLockedUntil(existingHold.lockedUntil);
    setTimeLeft(remainingSeconds);
    setTimerExpired(false);
    setStep('payment');
  };

  // Release existing hold so user can select another charger
  const handleReleaseExistingHold = async () => {
    if (!existingHold?.bookingId) return;
    setReleasingHold(true);
    const token = localStorage.getItem('voltsync_token');
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ bookingId: existingHold.bookingId })
      });
      if (res.ok) {
        setExistingHold(null);
        setError(null);
        await fetchSlots();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to release existing hold. Please try again.');
      }
    } catch (err) {
      setError('Unable to release existing hold right now. Please try again.');
    } finally {
      setReleasingHold(false);
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
        lockedUntil={lockedUntil}
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
                      onClick={() => {
                        setSelectedSlot(slot);
                      }}
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

              {/* Cinema-Seat Charger Selector for Selected Time Slot */}
              {selectedSlot && (
                <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} style={{ color: 'var(--accent-teal)' }} /> Select Charger (Seat):
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {currentSlotChargers.filter(c => c.status === 'AVAILABLE').length} of {currentSlotChargers.length} Available
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '8px' }}>
                    {currentSlotChargers.map((charger) => {
                      const isOwnHold = existingHold && existingHold.chargerId === charger.id;
                      const isAvail = charger.status === 'AVAILABLE' || isOwnHold;
                      const isSelected = selectedChargerId === charger.id;
                      const isHeld = charger.status === 'HELD';
                      const isBooked = charger.status === 'BOOKED';
                      const isMaint = charger.status === 'MAINTENANCE';

                      let badgeText = 'Available';
                      let badgeColor = '#059669';
                      let badgeBg = 'rgba(16, 185, 129, 0.12)';

                      if (isOwnHold) {
                        badgeText = 'Your Hold';
                        badgeColor = '#10b981';
                        badgeBg = 'rgba(16, 185, 129, 0.2)';
                      } else if (isHeld) {
                        badgeText = 'Held';
                        badgeColor = '#d97706';
                        badgeBg = 'rgba(245, 158, 11, 0.12)';
                      } else if (isBooked) {
                        badgeText = 'Booked';
                        badgeColor = '#dc2626';
                        badgeBg = 'rgba(239, 68, 68, 0.12)';
                      } else if (isMaint) {
                        badgeText = 'Maint';
                        badgeColor = '#6b7280';
                        badgeBg = 'rgba(107, 114, 128, 0.12)';
                      }

                      return (
                        <button
                          key={charger.id}
                          type="button"
                          disabled={!isAvail}
                          onClick={() => setSelectedChargerId(charger.id)}
                          className={`charger-seat-btn ${isSelected ? 'selected' : ''}`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px 4px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid var(--accent-primary, #10b981)' : (isOwnHold ? '2px dashed #10b981' : '1px solid var(--border-subtle, rgba(255,255,255,0.1))'),
                            background: isSelected ? 'rgba(16, 185, 129, 0.12)' : (isAvail ? 'var(--bg-elevated, rgba(255,255,255,0.03))' : 'rgba(0,0,0,0.2)'),
                            cursor: isAvail ? 'pointer' : 'not-allowed',
                            opacity: isAvail ? 1 : 0.55,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ fontSize: '13px', fontWeight: '700', color: isSelected ? 'var(--accent-primary, #10b981)' : 'var(--text-primary)' }}>
                            {charger.id}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: '600',
                              color: badgeColor,
                              backgroundColor: badgeBg,
                              padding: '2px 5px',
                              borderRadius: '4px',
                              marginTop: '3px'
                            }}
                          >
                            {badgeText}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 20px' }}>
              {/* FIX 1 & FIX 7: Lock error displayed directly above bottom CTA button */}
              {error && (
                <div 
                  className="alert-box-danger" 
                  style={{ 
                    width: '100%', 
                    margin: 0, 
                    padding: '8px 12px', 
                    fontSize: '12.5px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171'
                  }}
                >
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{error}</span>
                </div>
              )}

              {/* FIX 3, 4, 5: Existing Hold Management beside CTA */}
              {existingHold ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: 'var(--text-primary)',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Clock size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                    <div>
                      {existingHold.chargerId === selectedChargerId ? (
                        <span>
                          <b>{existingHold.chargerId}</b> is already held for you until{' '}
                          <b>{new Date(existingHold.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>.
                        </span>
                      ) : (
                        <span>
                          You already hold <b>{existingHold.chargerId}</b> for this time (until{' '}
                          {new Date(existingHold.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleContinueExistingHold}
                      className="action-btn"
                      style={{ flex: 1, height: '42px', fontSize: '13px', justifyContent: 'center' }}
                    >
                      {existingHold.chargerId === selectedChargerId 
                        ? 'Continue Existing Booking' 
                        : `Continue with ${existingHold.chargerId}`}
                    </button>
                    <button
                      type="button"
                      disabled={releasingHold}
                      onClick={handleReleaseExistingHold}
                      className="nav-btn"
                      style={{ 
                        flex: 1, 
                        height: '42px', 
                        fontSize: '12px', 
                        justifyContent: 'center',
                        border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))'
                      }}
                    >
                      {releasingHold ? 'Releasing...' : (
                        existingHold.chargerId === selectedChargerId 
                          ? 'Release Hold & Choose Another Charger' 
                          : `Release ${existingHold.chargerId} & select ${selectedChargerId}`
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleLockSlot}
                  disabled={!selectedSlot || !selectedChargerId || loading || (selectedSlot && selectedSlot.isFullyBooked)}
                  className="action-btn"
                  style={{ width: '100%', height: '46px', fontSize: '14px', gap: '8px' }}
                >
                  {loading ? 'Locking Slot...' : 'Lock Selected Slot & Proceed'} <ArrowRight size={16} />
                </button>
              )}
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
                      value={confirmedBookingData?.checkInCode || ticketRef}
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

