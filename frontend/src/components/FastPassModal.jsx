import React from 'react';
import { X, QrCode, MapPin, CheckCircle, Zap, ShieldCheck, Printer } from 'lucide-react';

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

  const ticketRef = `VS-${stationName.substring(0, 3).toUpperCase()}-${booking._id.substring(booking._id.length - 4).toUpperCase()}`;

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
            Present this verified QR pass at the charging pillar to initiate session.
          </p>
        </div>

        {/* Futuristic Digital Charging Pass Ticket */}
        <div className="ticket-pass">
          <div className="ticket-header">
            <div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={18} style={{ color: 'var(--accent-primary)' }} /> VoltSync FastPass
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Official Verified EV Reservation</div>
            </div>
            <div className="ticket-ref">{ticketRef}</div>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Details Grid */}
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Charging Station</span>
                <b style={{ color: '#fff', fontSize: '14px' }}>{stationName}</b>
              </div>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Charger Outlet</span>
                  <b style={{ color: 'var(--accent-teal)', fontSize: '14px' }}>{booking.chargerId}</b>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Speed Capacity</span>
                  <b style={{ color: '#fff', fontSize: '14px' }}>{chargingSpeedKw} kW Fast DC</b>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Reserved Time Window</span>
                <b style={{ color: 'var(--accent-green)', fontSize: '13px' }}>{formatSlotTime(booking.slotTime)}</b>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Driver Email</span>
                  <b style={{ color: '#fff' }}>{booking.userEmail || userEmail}</b>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Amount Paid</span>
                  <b style={{ color: 'var(--accent-green)' }}>₹{booking.amountPaid} INR</b>
                </div>
              </div>
            </div>

            {/* Scannable Check-in QR Pass */}
            <div className="qr-placeholder" style={{ margin: '0 auto' }}>
              <QrCode size={80} style={{ color: '#0a0f1d' }} />
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#0a0f1d', marginTop: '4px', textAlign: 'center', lineHeight: 1.2 }}>
                Show this pass at the charger
              </span>
            </div>
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
              <MapPin size={16} /> Open Maps Navigation
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="nav-btn"
            style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center', height: '40px', fontSize: '13px' }}
          >
            <Printer size={16} /> Print / Save PDF
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
