import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Printer, 
  Zap,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import QRCodeView from './QRCodeView';

const PaymentGatewayModal = ({
  station,
  bookingId,
  chargerId,
  slotTime,
  energyKwh = 15,
  userEmail,
  lockedUntil,
  onClose,
  onPaymentSuccess
}) => {
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [error, setError] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);

  // Derive countdown from server lock expiry
  const [secondsRemaining, setSecondsRemaining] = useState(300);

  useEffect(() => {
    if (!lockedUntil) return;
    const updateCountdown = () => {
      const now = Date.now();
      const expiry = new Date(lockedUntil).getTime();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      setSecondsRemaining(diff);
      if (diff <= 0) {
        setError('Your reservation hold has expired.');
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  // Create server order and fetch pricing breakdown on mount
  useEffect(() => {
    initiateOrderFlow();
  }, [bookingId]);

  const initiateOrderFlow = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('voltsync_token');

      // 1. Fetch Gateway Config
      const configRes = await fetch(`${API_BASE_URL}/payments/config`);
      const configJson = await configRes.json();

      if (configJson.configured === false) {
        setError('Payment service is temporarily unavailable. Please try again later.');
        setLoading(false);
        return;
      }

      // 2. Create Server-Authorized Order
      const orderRes = await fetch(`${API_BASE_URL}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bookingId,
          energyKwh: Number(energyKwh) || 15
        })
      });

      const orderJson = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderJson.error || 'Payment could not be completed. Please try again.');
      }

      setOrderData(orderJson);
    } catch (err) {
      console.error('Order initialization error:', err);
      setError(err.message || 'Payment could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Complete Demo Payment with server-authoritative confirmation
  const handleCompleteDemoPayment = async () => {
    if (processingPayment || secondsRemaining <= 0) return;
    setProcessingPayment(true);
    setError(null);

    try {
      const token = localStorage.getItem('voltsync_token');

      const response = await fetch(`${API_BASE_URL}/payments/demo-pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bookingId
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setPaymentReceipt(data.receipt);
        if (onPaymentSuccess) {
          onPaymentSuccess(data.booking);
        }
      } else {
        if (data.error && data.error.toLowerCase().includes('expired')) {
          setError('Your reservation hold has expired.');
        } else {
          setError(data.error || 'Payment could not be completed. Please try again.');
        }
      }
    } catch (err) {
      console.error('Demo payment error:', err);
      setError('Payment could not be completed. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatSlotTime = (isoString) => {
    if (!isoString) return 'Upcoming Slot';
    const d = new Date(isoString);
    const startHour = d.getHours();
    const endHour = (startHour + 1) % 24;
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} • ${startHour.toString().padStart(2, '0')}:00 – ${endHour.toString().padStart(2, '0')}:00`;
  };

  // SUCCESS STATE: Verified Reservation Confirmation & Digital QR Pass
  if (paymentReceipt) {
    return (
      <div className="modal-overlay">
        <div className="modal-content glass" style={{ width: '560px', maxWidth: '95vw' }}>
          <button onClick={onClose} className="close-modal-btn" title="Close">
            <X size={20} />
          </button>

          <div className="modal-header" style={{ textAlign: 'center', paddingBottom: '12px' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(16, 185, 129, 0.12)', border: '2px solid #10b981', borderRadius: '50%', padding: '10px', color: '#10b981', marginBottom: '8px' }}>
              <CheckCircle size={32} />
            </div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Charging Slot Confirmed
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              Payment completed successfully. Your charging slot reservation is confirmed.
            </p>
          </div>

          <div className="modal-body">
            {/* Tax Invoice & Digital Pass Card */}
            <div className="ticket-pass" style={{ marginBottom: '14px' }}>
              <div className="ticket-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={16} style={{ color: '#10b981' }} /> VoltSync FastPass
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Booking Ref: {paymentReceipt.bookingReference || paymentReceipt.orderId}
                  </span>
                </div>
                <div className="ticket-ref" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px' }}>
                  {paymentReceipt.invoiceNumber}
                </div>
              </div>

              {/* Clean Label/Value Rows */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px', marginBottom: '14px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Station</span>
                  <b style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{paymentReceipt.stationName}</b>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Outlet</span>
                  <b style={{ color: 'var(--accent-teal)', fontSize: '13px' }}>{paymentReceipt.chargerId} (Fast DC)</b>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Date & Time</span>
                  <b style={{ color: '#047857', fontSize: '12px' }}>{formatSlotTime(paymentReceipt.slotTime)}</b>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Booking ID</span>
                  <b style={{ color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '11px' }}>
                    {paymentReceipt.bookingReference || paymentReceipt.orderId}
                  </b>
                </div>
              </div>

              {/* Energy & Amount Summary */}
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Energy Estimate:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{paymentReceipt.energyKwh || energyKwh} kWh</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Rate:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>₹{paymentReceipt.unitPricePerKwh || station?.pricingPerKwh || 14}/kWh</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GST (18%):</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>₹{paymentReceipt.taxBreakdown?.gstAmount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #cbd5e1', fontWeight: 800 }}>
                  <span style={{ color: 'var(--text-primary)' }}>Amount Paid:</span>
                  <span style={{ color: '#047857', fontSize: '15px' }}>₹{paymentReceipt.totalPaid || paymentReceipt.paidAmount || 0} INR</span>
                </div>
              </div>

              <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(16, 185, 129, 0.06)', border: '1px dashed rgba(16, 185, 129, 0.4)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ background: '#ffffff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                  <QRCodeView value={paymentReceipt.checkInCode || 'VP-ACTIVE'} size={76} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Digital Pass / QR: {paymentReceipt.checkInCode || 'VP-ACTIVE'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                    Present this verifiable QR pass to the station operator upon arrival for instant slot access.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => window.print()}
              className="nav-btn"
              style={{ flex: 1, border: '1px solid #cbd5e1', justifyContent: 'center', height: '42px', fontSize: '13px' }}
            >
              <Printer size={16} /> Print Receipt
            </button>
            <button
              onClick={onClose}
              className="action-btn"
              style={{ flex: 1, height: '42px', fontSize: '13px' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // CHECKOUT STATE: Clean Professional Label/Value Rows
  const pricingRate = station?.pricingPerKwh || 14;
  const energyVal = Number(energyKwh) || 15;
  const baseCost = orderData?.taxBreakdown?.baseAmount || Math.round(energyVal * pricingRate);
  const gstCost = orderData?.taxBreakdown?.gstAmount || Math.round(baseCost * 0.18);
  const totalAmount = orderData?.amount || (baseCost + gstCost);
  const isHoldExpired = secondsRemaining <= 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass" style={{ width: '520px', maxWidth: '95vw' }}>
        <button onClick={onClose} className="close-modal-btn" title="Close Checkout">
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)' }}>
              VoltSync Payment Checkout
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#059669', fontWeight: 600 }}>
              Demo Payment Mode
            </p>
          </div>
          <div className="timer-container" style={{ margin: 0, padding: '4px 10px', fontSize: '12px', background: isHoldExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: isHoldExpired ? '#dc2626' : '#047857' }}>
            <Clock size={14} /> Hold: {formatTimer(secondsRemaining)}
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {error && (
            <div className="alert-box-danger" style={{ marginBottom: '14px' }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Demonstration Notice */}
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={16} color="#059669" style={{ flexShrink: 0 }} />
            <span>This checkout is running in demonstration mode. No real money will be charged.</span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: '12px' }}>
              <div style={{ border: '3px solid #e2e8f0', borderTop: '3px solid #10b981', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }}></div>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Preparing demo checkout order...</span>
            </div>
          ) : (
            <div>
              {/* Clean Booking Summary Rows */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Station</span>
                    <b style={{ fontSize: '13px', color: 'var(--text-primary)', textAlign: 'right', maxWidth: '65%' }}>
                      {station?.name}
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Outlet</span>
                    <b style={{ fontSize: '13px', color: 'var(--accent-teal)' }}>
                      {chargerId} (Fast DC)
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Charging Slot</span>
                    <b style={{ fontSize: '12px', color: '#047857' }}>
                      {formatSlotTime(slotTime)}
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Energy Estimate</span>
                    <b style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                      {energyVal} kWh
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Charging Rate</span>
                    <b style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      ₹{pricingRate}/kWh
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>GST (18%)</span>
                    <b style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      ₹{gstCost}
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Total Amount</span>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#047857' }}>
                      ₹{totalAmount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informational Chips: Demo Transaction / No Real Charge */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={12} color="#059669" /> Demo Transaction
                </span>
                <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} color="#0284c7" /> No real charge
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer: Double Click Protection & Sticky CTA */}
        <div className="modal-footer">
          {isHoldExpired ? (
            <button
              onClick={onClose}
              className="action-btn"
              style={{ width: '100%', height: '46px', fontSize: '14px', background: '#dc2626' }}
            >
              <RotateCcw size={16} /> Select Another Slot
            </button>
          ) : (
            <button
              onClick={handleCompleteDemoPayment}
              disabled={loading || processingPayment || isHoldExpired}
              className="action-btn"
              style={{ width: '100%', height: '46px', fontSize: '14px', gap: '8px', opacity: (loading || processingPayment || isHoldExpired) ? 0.7 : 1 }}
            >
              {processingPayment ? (
                <>Processing demo payment...</>
              ) : (
                <>Complete Demo Payment • ₹{totalAmount}</>
              )}
            </button>
          )}

          <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            🔒 Verified Demo Protocol • Instant Pass Generation
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentGatewayModal;
