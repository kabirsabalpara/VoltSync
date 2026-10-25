import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  CreditCard, 
  Smartphone, 
  Building2, 
  Wallet,
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Printer, 
  Zap,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import QRCodeView from './QRCodeView';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

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
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [error, setError] = useState(null);
  const [paymentCancelled, setPaymentCancelled] = useState(false);
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

  // Fetch gateway configuration and create server order on mount
  useEffect(() => {
    initiateOrderFlow();
  }, [bookingId]);

  const initiateOrderFlow = async () => {
    setLoading(true);
    setError(null);
    setPaymentCancelled(false);
    try {
      const token = localStorage.getItem('voltsync_token');

      // 1. Fetch Gateway Config
      const configRes = await fetch(`${API_BASE_URL}/payments/config`);
      const configJson = await configRes.json();
      setGatewayConfig(configJson);

      // Check if gateway is available
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
        throw new Error(orderJson.error || 'Payment service is temporarily unavailable. Please try again later.');
      }

      setOrderData(orderJson);
    } catch (err) {
      console.error('Order initialization error:', err);
      setError(err.message || 'Payment service is temporarily unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Launch Razorpay Standard Checkout
  const handleLaunchPayment = async () => {
    if (!orderData || processingPayment) return;
    setProcessingPayment(true);
    setError(null);
    setPaymentCancelled(false);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setProcessingPayment(false);
      setError('Unable to load secure payment SDK. Please check your internet connection.');
      return;
    }

    try {
      const token = localStorage.getItem('voltsync_token');
      const keyId = orderData.keyId || gatewayConfig?.keyId;

      if (!keyId) {
        setProcessingPayment(false);
        setError('Payment service is temporarily unavailable. Please try again later.');
        return;
      }

      const options = {
        key: keyId,
        amount: orderData.amountInPaise,
        currency: orderData.currency || 'INR',
        name: 'VoltSync EV Network',
        description: `EV Charging: ${station?.name || 'VoltSync Hub'} (${chargerId})`,
        order_id: orderData.orderId,
        prefill: {
          email: userEmail || ''
        },
        theme: {
          color: '#10b981' // VoltSync Emerald Accent
        },
        handler: async function (response) {
          try {
            // Cryptographic server-side verification
            const verifyRes = await fetch(`${API_BASE_URL}/payments/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({
                bookingId,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                paymentMethod: 'razorpay'
              })
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPaymentReceipt(verifyData.receipt);
              if (onPaymentSuccess) {
                onPaymentSuccess(verifyData.booking);
              }
            } else {
              setError(verifyData.error || 'Payment verification failed. Your booking was not confirmed.');
            }
          } catch (verErr) {
            setError('Payment verification failed. Your booking was not confirmed.');
          } finally {
            setProcessingPayment(false);
          }
        },
        modal: {
          ondismiss: function () {
            setProcessingPayment(false);
            setPaymentCancelled(true);
          }
        }
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (err) {
      console.error('Razorpay invocation error:', err);
      setProcessingPayment(false);
      setError('Payment service error: ' + err.message);
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
              Payment verified securely. Your charging slot reservation is confirmed.
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
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Date / Time Slot</span>
                  <b style={{ color: '#047857', fontSize: '12px' }}>{formatSlotTime(paymentReceipt.slotTime)}</b>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Transaction ID</span>
                  <b style={{ color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '11px' }}>
                    {paymentReceipt.transactionId}
                  </b>
                </div>
              </div>

              {/* Energy & Tax Breakdown */}
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Energy Estimate ({energyKwh} kWh):</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>₹{paymentReceipt.taxBreakdown?.baseAmount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GST (18%):</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>₹{paymentReceipt.taxBreakdown?.gstAmount || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #cbd5e1', fontWeight: 800 }}>
                  <span style={{ color: 'var(--text-primary)' }}>Total Amount Paid:</span>
                  <span style={{ color: '#047857', fontSize: '15px' }}>₹{paymentReceipt.totalPaid} INR</span>
                </div>
              </div>

              {/* Verified Digital QR Pass Check-in Box */}
              <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(16, 185, 129, 0.06)', border: '1px dashed rgba(16, 185, 129, 0.4)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ background: '#ffffff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                  <QRCodeView value={typeof window !== 'undefined' ? `${window.location.origin}/checkin/${paymentReceipt.checkInCode || 'VP-ACTIVE'}` : `https://voltsync.app/checkin/${paymentReceipt.checkInCode || 'VP-ACTIVE'}`} size={76} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Digital Check-in Pass: {paymentReceipt.checkInCode || 'VP-ACTIVE'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                    Present this scannable QR pass to the station operator or scanner upon arrival for verified session access.
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

  // CHECKOUT STATE: Clean Professional Label/Value Rows & Razorpay Trigger
  const totalAmount = orderData?.amount || Math.round((Number(energyKwh) * (station?.pricingPerKwh || 15)) * 1.18);
  const baseCost = orderData?.taxBreakdown?.baseAmount || Math.round(Number(energyKwh) * (station?.pricingPerKwh || 15));
  const gstCost = orderData?.taxBreakdown?.gstAmount || Math.round(baseCost * 0.18);
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
              Verified Payment Checkout
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Secure Reservation Lock & FastPass Confirmation
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

          {paymentCancelled && !isHoldExpired && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="#d97706" />
              <span>Payment was not completed. Your slot hold is still active.</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: '12px' }}>
              <div style={{ border: '3px solid #e2e8f0', borderTop: '3px solid #10b981', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }}></div>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Preparing secure checkout order...</span>
            </div>
          ) : (
            <div>
              {/* Order Details Card: Clean Label / Value Rows */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
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
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Slot</span>
                    <b style={{ fontSize: '12px', color: '#047857' }}>
                      {formatSlotTime(slotTime)}
                    </b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Energy Estimate</span>
                    <b style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                      {energyKwh} kWh × ₹{station?.pricingPerKwh || 15}/kWh
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

              {/* Supported Payment Methods Informational Chips */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                  SUPPORTED PAYMENT OPTIONS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Smartphone size={12} color="#059669" /> UPI
                  </span>
                  <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CreditCard size={12} color="#0284c7" /> Cards
                  </span>
                  <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Building2 size={12} color="#7c3aed" /> Netbanking
                  </span>
                  <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Wallet size={12} color="#d97706" /> Wallets
                  </span>
                </div>
              </div>

              {/* Security Statement */}
              <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} color="#059669" style={{ flexShrink: 0 }} />
                <span>UPI, Cards, Netbanking and other supported methods are processed securely through Razorpay.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer: Sticky/Always Visible Primary CTA */}
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
              onClick={handleLaunchPayment}
              disabled={loading || processingPayment || !orderData || gatewayConfig?.configured === false}
              className="action-btn"
              style={{ width: '100%', height: '46px', fontSize: '14px', gap: '8px' }}
            >
              {processingPayment ? (
                <>Opening secure payment...</>
              ) : paymentCancelled ? (
                <><RotateCcw size={16} /> Retry Payment (₹{totalAmount})</>
              ) : (
                <><Lock size={15} /> Pay ₹{totalAmount} Securely <ArrowRight size={16} /></>
              )}
            </button>
          )}

          <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            🔒 256-bit TLS encrypted transaction • Official VoltSync Reservation Protocol
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentGatewayModal;

