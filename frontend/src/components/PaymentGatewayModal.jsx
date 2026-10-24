import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  CreditCard, 
  Smartphone, 
  Building2, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  QrCode, 
  ArrowRight, 
  RefreshCw, 
  FileText, 
  Printer, 
  MapPin,
  Zap,
  ExternalLink
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
        setError('Reservation hold has expired. Please select a slot again.');
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
    try {
      const token = localStorage.getItem('voltsync_token');

      // 1. Fetch Gateway Capabilities
      const configRes = await fetch(`${API_BASE_URL}/payments/config`);
      const configData = await configRes.json();
      setGatewayConfig(configData);

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
        throw new Error(orderJson.error || 'Failed to initialize payment order on server.');
      }

      setOrderData(orderJson);
    } catch (err) {
      console.error('Order initialization error:', err);
      setError(err.message || 'Payment system initialization failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Launch Razorpay Hosted Checkout
  const handleRazorpayCheckout = async () => {
    if (!orderData || !gatewayConfig) return;
    setProcessingPayment(true);
    setError(null);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setProcessingPayment(false);
      setError('Unable to load Razorpay payment SDK. Please check your network connection.');
      return;
    }

    try {
      const token = localStorage.getItem('voltsync_token');
      const options = {
        key: orderData.keyId,
        amount: orderData.amountInPaise,
        currency: orderData.currency || 'INR',
        name: 'VoltSync EV Network',
        description: `EV Charging Hold: ${station?.name || 'VoltSync Hub'} (${chargerId})`,
        order_id: orderData.orderId,
        prefill: {
          email: userEmail || ''
        },
        theme: {
          color: '#f5a623'
        },
        handler: async function (response) {
          try {
            // Verify cryptographically on backend
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
            if (verifyRes.ok) {
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
          }
        }
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (err) {
      console.error('Razorpay invocation error:', err);
      setProcessingPayment(false);
      setError('Payment initialization error: ' + err.message);
    }
  };

  // Verified Sandbox Mode Simulation
  const handleSandboxSimulatedPayment = async () => {
    if (!orderData) return;
    setProcessingPayment(true);
    setError(null);

    try {
      const token = localStorage.getItem('voltsync_token');
      const testPaymentId = `pay_sandbox_${Date.now()}`;
      
      const response = await fetch(`${API_BASE_URL}/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bookingId,
          orderId: orderData.orderId,
          paymentId: testPaymentId,
          paymentMethod: 'upi'
        })
      });

      const data = await response.json();
      if (response.ok) {
        setPaymentReceipt(data.receipt);
        if (onPaymentSuccess) {
          onPaymentSuccess(data.booking);
        }
      } else {
        setError(data.error || 'Payment verification failed. Your booking was not confirmed.');
      }
    } catch (err) {
      setError('Payment verification failed. Your booking was not confirmed.');
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
    return `${d.toLocaleDateString()} • ${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00`;
  };

  // SUCCESS STATE: Official Receipt & Check-in Pass
  if (paymentReceipt) {
    return (
      <div className="modal-overlay">
        <div className="modal-content glass" style={{ width: '560px', maxWidth: '95vw', padding: '28px' }}>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(52, 211, 153, 0.15)', border: '2px solid var(--accent-green)', borderRadius: '50%', padding: '12px', color: 'var(--accent-green)', marginBottom: '8px' }}>
              <CheckCircle size={36} />
            </div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Booking Confirmed!
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              Payment verified successfully. Your charger hold is now active.
            </p>
          </div>

          {/* Official Tax Invoice & Pass Box */}
          <div className="ticket-pass" style={{ marginBottom: '16px' }}>
            <div className="ticket-header">
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={16} style={{ color: 'var(--accent-primary)' }} /> VoltSync FastPass Pass
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Ref: {paymentReceipt.bookingReference || paymentReceipt.orderId}
                </span>
              </div>
              <div className="ticket-ref">
                {paymentReceipt.invoiceNumber}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Station</span>
                <b style={{ display: 'block', color: 'var(--text-primary)' }}>{paymentReceipt.stationName}</b>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Charger Outlet</span>
                <b style={{ display: 'block', color: 'var(--accent-teal)' }}>{paymentReceipt.chargerId}</b>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reserved Slot</span>
                <b style={{ display: 'block', color: 'var(--accent-green)' }}>{formatSlotTime(paymentReceipt.slotTime)}</b>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transaction ID</span>
                <b style={{ display: 'block', color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '11px' }}>
                  {paymentReceipt.transactionId}
                </b>
              </div>
            </div>

            {/* Tax Breakdown (GST Only, No 2% Cess) */}
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Base Energy Charge ({energyKwh} kWh):</span>
                <span style={{ color: 'var(--text-primary)' }}>₹{paymentReceipt.taxBreakdown?.baseAmount || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>GST (18% EV Charging Services):</span>
                <span style={{ color: 'var(--text-primary)' }}>₹{paymentReceipt.taxBreakdown?.gstAmount || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', fontWeight: 'bold' }}>
                <span style={{ color: 'var(--text-primary)' }}>Total Amount Paid:</span>
                <span style={{ color: 'var(--accent-green)', fontSize: '13px' }}>₹{paymentReceipt.totalPaid} INR</span>
              </div>
            </div>

            {/* Verifiable FastPass QR Code Check-in Info */}
            <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(245, 166, 35, 0.08)', border: '1px dashed rgba(245, 166, 35, 0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#fff', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QRCodeView value={typeof window !== 'undefined' ? `${window.location.origin}/checkin/${paymentReceipt.checkInCode || 'VP-ACTIVE'}` : `https://voltsync.app/checkin/${paymentReceipt.checkInCode || 'VP-ACTIVE'}`} size={70} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                  Check-in Code: {paymentReceipt.checkInCode || 'VP-ACTIVE'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Present this code to station operator upon arrival. Note: Session check-in verifies reservation validity.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => window.print()}
              className="nav-btn"
              style={{ flex: 1, border: '1px solid var(--border-subtle)', justifyContent: 'center', height: '40px' }}
            >
              <Printer size={16} /> Print Receipt
            </button>
            <button
              onClick={onClose}
              className="action-btn"
              style={{ flex: 1, height: '40px' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content glass" style={{ width: '520px', maxWidth: '95vw', padding: '24px' }}>
        <button onClick={onClose} className="close-modal-btn" title="Close Checkout">
          <X size={22} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Verified Payment Checkout
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Server-Authorized EV Charger Reservation
            </p>
          </div>
          <div className="timer-container" style={{ margin: 0, padding: '4px 10px', fontSize: '12px' }}>
            <Clock size={14} /> Hold: {formatTimer(secondsRemaining)}
          </div>
        </div>

        {error && (
          <div className="alert-box-danger" style={{ marginBottom: '16px' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '12px' }}>
            <div style={{ border: '3px solid var(--bg-tertiary)', borderTop: '3px solid var(--accent-primary)', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }}></div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Creating secure server payment order...</span>
          </div>
        ) : (
          <div>
            {/* Environment mode alert */}
            {gatewayConfig?.isRazorpayConfigured ? (
              <div style={{ background: 'rgba(56, 239, 125, 0.08)', border: '1px solid rgba(56, 239, 125, 0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} />
                <span>Razorpay Live/Test Gateway Active. Payments are verified with cryptographic signatures.</span>
              </div>
            ) : (
              <div style={{ background: 'rgba(245, 166, 35, 0.1)', border: '1px solid rgba(245, 166, 35, 0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} />
                <span>VoltSync Interactive Development Sandbox. Testing server order verification without live Razorpay keys.</span>
              </div>
            )}

            {/* Order Details Card */}
            <div className="order-summary-box" style={{ marginBottom: '16px' }}>
              <div className="order-summary-row">
                <span>Station:</span>
                <b style={{ color: 'var(--text-primary)' }}>{station?.name}</b>
              </div>
              <div className="order-summary-row">
                <span>Outlet Assigned:</span>
                <b style={{ color: 'var(--accent-teal)' }}>{chargerId} (Fast DC)</b>
              </div>
              <div className="order-summary-row">
                <span>Slot Window:</span>
                <b style={{ color: 'var(--text-primary)' }}>{formatSlotTime(slotTime)}</b>
              </div>
              <div className="order-summary-row">
                <span>Energy Estimate:</span>
                <b style={{ color: 'var(--text-primary)' }}>{energyKwh} kWh (@ ₹{station?.pricingPerKwh || 15}/kWh)</b>
              </div>
              <div className="order-summary-row">
                <span>GST (18%):</span>
                <b style={{ color: 'var(--text-secondary)' }}>₹{orderData?.taxBreakdown?.gstAmount || Math.round((energyKwh * 15) * 0.18)}</b>
              </div>
              <div className="order-summary-total">
                <span style={{ color: 'var(--text-primary)' }}>Total Amount Due:</span>
                <span style={{ color: 'var(--accent-green)', fontSize: '18px' }}>
                  ₹{orderData?.amount || Math.round((energyKwh * 15) * 1.18)} INR
                </span>
              </div>
            </div>

            {/* Checkout Action */}
            {gatewayConfig?.isRazorpayConfigured ? (
              <button
                onClick={handleRazorpayCheckout}
                disabled={processingPayment || secondsRemaining <= 0}
                className="action-btn"
                style={{ width: '100%', height: '44px', fontSize: '14px', gap: '8px' }}
              >
                {processingPayment ? (
                  <>Processing Razorpay Checkout...</>
                ) : (
                  <>Pay ₹{orderData?.amount} with Razorpay <ExternalLink size={16} /></>
                )}
              </button>
            ) : (
              <button
                onClick={handleSandboxSimulatedPayment}
                disabled={processingPayment || secondsRemaining <= 0}
                className="action-btn"
                style={{ width: '100%', height: '44px', fontSize: '14px', gap: '8px' }}
              >
                {processingPayment ? (
                  <>Verifying Sandbox Order...</>
                ) : (
                  <>Simulate Verified Payment (₹{orderData?.amount}) <ArrowRight size={16} /></>
                )}
              </button>
            )}

            <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
              🔒 256-bit TLS encrypted connection • Official VoltSync Reservation Protocol
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentGatewayModal;
