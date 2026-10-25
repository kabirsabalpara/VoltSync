import React from 'react';
import { X, MapPin, CheckCircle, Zap, ShieldCheck, Printer, Calendar, Clock, AlertCircle } from 'lucide-react';
import QRCodeView from './QRCodeView';

const FastPassModal = ({ booking, userEmail, onClose }) => {
  if (!booking) return null;

  const stationName = booking.stationId?.name || 'VoltSync Charging Station';
  const chargingSpeedKw = booking.stationId?.chargingSpeedKw || 50;
  const coords = booking.stationId?.location?.coordinates;
  const destLat = coords ? coords[1] : null;
  const destLng = coords ? coords[0] : null;

  const formatSlotTime = (isoString) => {
    if (!isoString) return 'Active Slot';
    const d = new Date(isoString);
    const startHour = d.getHours();
    const endHour = (startHour + 1) % 24;
    const dateStr = d.toLocaleDateString();
    return `${dateStr} • ${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00`;
  };

  const bookingRef = booking.bookingReference || `VS-${booking._id ? booking._id.slice(-6).toUpperCase() : 'PASS'}`;
  const checkInCode = booking.checkInCode || `VP-${booking._id ? booking._id.slice(-8).toUpperCase() : 'AUTH'}`;
  const qrPayload = checkInCode;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content glass" 
        style={{ width: '560px', maxWidth: '95vw', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="close-modal-btn" title="Close Pass">
          <X size={22} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(52, 211, 153, 0.15)', border: '2px solid var(--accent-green)', borderRadius: '50%', padding: '10px', color: 'var(--accent-green)', marginBottom: '8px' }}>
            <CheckCircle size={32} />
          </div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Digital FastPass Ticket
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Verified reservation credential for station check-in.
          </p>
        </div>

        {/* Digital Charging Pass Ticket */}
        <div className="ticket-pass">
          <div className="ticket-header">
            <div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={18} style={{ color: 'var(--accent-primary)' }} /> VoltSync FastPass
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Official Verified EV Reservation Pass</div>
            </div>
            <div className="ticket-ref">{bookingRef}</div>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Details Column */}
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Charging Station</span>
                <b style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{stationName}</b>
              </div>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Charger Outlet</span>
                  <b style={{ color: 'var(--accent-teal)', fontSize: '14px' }}>{booking.chargerId}</b>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Speed Capacity</span>
                  <b style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{chargingSpeedKw} kW Fast DC</b>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Reserved Time Window</span>
                <b style={{ color: 'var(--accent-green)', fontSize: '13px' }}>{formatSlotTime(booking.slotTime)}</b>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Driver</span>
                  <b style={{ color: 'var(--text-primary)' }}>{booking.userEmail || userEmail}</b>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Amount Paid</span>
                  <b style={{ color: 'var(--accent-green)' }}>₹{booking.amountPaid} INR</b>
                </div>
              </div>
            </div>

            {/* Authentic SVG QR Code with Check-in Pass */}
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 auto' }}>
              <QRCodeView value={qrPayload} size={140} />
              <div style={{ marginTop: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '4px 10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '1px' }}>
                  {checkInCode}
                </span>
              </div>
            </div>
          </div>

          {/* Integration & Hardware Disclaimer */}
          <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} />
            <span>Present this pass to the on-site operator for verification. Digital pass confirms slot hold and does not physically activate high-voltage dispensing without physical cable hookup.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {destLat && destLng && (
            <button
              type="button"
              onClick={() => {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`, '_blank');
              }}
              className="nav-btn"
              style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center', height: '40px', fontSize: '13px' }}
            >
              <MapPin size={16} /> Navigate
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="nav-btn"
            style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center', height: '40px', fontSize: '13px' }}
          >
            <Printer size={16} /> Print Pass
          </button>

          <button 
            type="button"
            onClick={onClose} 
            className="action-btn" 
            style={{ flex: 1, height: '40px', fontSize: '13px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default FastPassModal;
