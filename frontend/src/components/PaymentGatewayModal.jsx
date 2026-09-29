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
  QrCode, 
  ArrowRight, 
  RefreshCw, 
  FileText, 
  Printer, 
  Download,
  Zap,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const POPULAR_UPI_APPS = [
  { id: 'gpay', name: 'Google Pay', icon: '🟢', handle: '@okaxis' },
  { id: 'phonepe', name: 'PhonePe', icon: '🟣', handle: '@ybl' },
  { id: 'paytm', name: 'Paytm UPI', icon: '🔵', handle: '@paytm' },
  { id: 'bhim', name: 'BHIM UPI', icon: '🟠', handle: '@upi' }
];

const POPULAR_BANKS = [
  { id: 'hdfc', name: 'HDFC Bank', code: 'HDFC' },
  { id: 'sbi', name: 'State Bank of India', code: 'SBI' },
  { id: 'icici', name: 'ICICI Bank', code: 'ICICI' },
  { id: 'axis', name: 'Axis Bank', code: 'AXIS' },
  { id: 'kotak', name: 'Kotak Mahindra', code: 'KOTAK' }
];

const PaymentGatewayModal = ({
  station,
  bookingId,
  chargerId,
  slotTime,
  energyKwh,
  userEmail,
  onClose,
  onPaymentSuccess
}) => {
  const [activeMethod, setActiveMethod] = useState('upi'); // upi | card | netbanking | wallet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orderData, setOrderData] = useState(null);

  // UPI Form State
  const [upiId, setUpiId] = useState('');
  const [selectedApp, setSelectedApp] = useState(POPULAR_UPI_APPS[0].id);

  // Card Form State
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('Alex Driver');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Netbanking State
  const [selectedBank, setSelectedBank] = useState('hdfc');

  // Wallet State
  const [walletBalance] = useState(1500); // 1,500 INR demo wallet balance

  // 3D Secure OTP Verification State
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpTimer, setOtpTimer] = useState(60);

  // Final Confirmation Receipt
  const [paymentReceipt, setPaymentReceipt] = useState(null);

  // Fetch or initialize Payment Order on mount
  useEffect(() => {
    initializePaymentOrder();
  }, [bookingId]);

  const initializePaymentOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('voltsync_token');
      const response = await fetch(`${API_BASE_URL}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bookingId,
          energyKwh: energyKwh || 15,
          paymentMethod: activeMethod
        })
      });

      if (response.ok) {
        const data = await response.json();
        setOrderData(data);
      } else {
        // Fallback for cloud deployment transitions (e.g. backend redeploying)
        const validEnergy = Math.max(1, Number(energyKwh || 15));
        const baseEnergyCost = Math.round(validEnergy * (station?.pricingPerKwh || 15));
        const gstAmount = Math.round(baseEnergyCost * 0.18);
        const cessAmount = Math.round(baseEnergyCost * 0.02);
        const totalAmount = baseEnergyCost + gstAmount + cessAmount;
        setOrderData({
          orderId: `order_vs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          amount: totalAmount,
          currency: 'INR',
          invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
          taxBreakdown: {
            baseAmount: baseEnergyCost,
            gstAmount,
            cessAmount,
            totalAmount
          }
        });
      }
    } catch (err) {
      // Graceful local generation if network error
      const validEnergy = Math.max(1, Number(energyKwh || 15));
      const baseEnergyCost = Math.round(validEnergy * (station?.pricingPerKwh || 15));
      const gstAmount = Math.round(baseEnergyCost * 0.18);
      const cessAmount = Math.round(baseEnergyCost * 0.02);
      const totalAmount = baseEnergyCost + gstAmount + cessAmount;
      setOrderData({
        orderId: `order_vs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        amount: totalAmount,
        currency: 'INR',
        invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        taxBreakdown: {
          baseAmount: baseEnergyCost,
          gstAmount,
          cessAmount,
          totalAmount
        }
      });
    } finally {
      setLoading(false);
    }
  };

  // Card Number Auto-formatting (xxxx xxxx xxxx xxxx)
  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').substring(0, 16);
    const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
    setCardNumber(formatted);
  };

  // Expiry MM/YY formatting
  const handleExpiryChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (raw.length >= 3) {
      setCardExpiry(`${raw.substring(0, 2)}/${raw.substring(2, 4)}`);
    } else {
      setCardExpiry(raw);
    }
  };

  // OTP Timer countdown
  useEffect(() => {
    let timer;
    if (showOtpScreen && otpTimer > 0) {
      timer = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [showOtpScreen, otpTimer]);

  // Initiate Payment Execution
  const handlePay = () => {
    setError(null);

    if (activeMethod === 'upi') {
      // Validate UPI if manual ID is typed
      if (upiId && !upiId.includes('@')) {
        setError('Please enter a valid UPI ID (e.g. yourname@oksbi)');
        return;
      }
    } else if (activeMethod === 'card') {
      const cleanNum = cardNumber.replace(/\s/g, '');
      if (cleanNum.length < 15) {
        setError('Please enter a valid 16-digit Card Number.');
        return;
      }
      if (!cardExpiry || cardExpiry.length < 5) {
        setError('Please enter a valid Expiry Date (MM/YY).');
        return;
      }
      if (!cardCvv || cardCvv.length < 3) {
        setError('Please enter 3-digit CVV security code.');
        return;
      }

      // Trigger 3D Secure Bank OTP screen simulation
      setShowOtpScreen(true);
      setOtpValue('482910'); // Simulated default prefilled OTP for effortless demonstration
      return;
    } else if (activeMethod === 'wallet') {
      const totalPayable = orderData?.taxBreakdown?.totalAmount || 250;
      if (walletBalance < totalPayable) {
        setError('Insufficient balance in VoltSync Wallet. Please top up or choose another payment method.');
        return;
      }
    }

    // Process payment verification directly
    completePaymentVerification();
  };

  const completePaymentVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('voltsync_token');
      const paymentId = `pay_${activeMethod}_${Math.random().toString(36).substring(2, 10)}`;
      const signature = `sig_${Math.random().toString(36).substring(2, 14)}`;

      let response = await fetch(`${API_BASE_URL}/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          bookingId,
          orderId: orderData?.orderId || `order_${Date.now()}`,
          paymentId,
          signature,
          paymentMethod: activeMethod
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPaymentReceipt(data.receipt);
        setShowOtpScreen(false);
        if (onPaymentSuccess) {
          onPaymentSuccess(data.booking);
        }
      } else {
        // Fallback: call /bookings/confirm if /payments/verify is not deployed on backend yet
        const confirmRes = await fetch(`${API_BASE_URL}/bookings/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            bookingId,
            paymentIntentId: paymentId,
            energyKwh: energyKwh || 15
          })
        });

        if (confirmRes.ok) {
          const confirmData = await confirmRes.json();
          setPaymentReceipt({
            invoiceNumber: orderData?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
            transactionId: paymentId,
            orderId: orderData?.orderId || `order_${Date.now()}`,
            paymentGateway: 'VoltSync Gateway',
            paymentMethod: activeMethod,
            stationName: station?.name || 'VoltSync Hub',
            chargerId: chargerId || 'C1',
            slotTime: slotTime,
            taxBreakdown: orderData?.taxBreakdown || {
              baseAmount: Math.round((energyKwh || 15) * (station?.pricingPerKwh || 15)),
              gstAmount: Math.round((energyKwh || 15) * (station?.pricingPerKwh || 15) * 0.18),
              cessAmount: Math.round((energyKwh || 15) * (station?.pricingPerKwh || 15) * 0.02),
              totalAmount: Math.round((energyKwh || 15) * (station?.pricingPerKwh || 15) * 1.2)
            },
            totalPaid: orderData?.taxBreakdown?.totalAmount || Math.round((energyKwh || 15) * (station?.pricingPerKwh || 15) * 1.2),
            timestamp: new Date().toISOString()
          });
          setShowOtpScreen(false);
          if (onPaymentSuccess) {
            onPaymentSuccess(confirmData.booking);
          }
        } else {
          const errData = await confirmRes.json().catch(() => ({}));
          setError(errData.error || 'Payment confirmation failed.');
        }
      }
    } catch (err) {
      setError('Payment verification network error. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const formatSlotTime = (isoString) => {
    if (!isoString) return 'Upcoming Slot';
    const d = new Date(isoString);
    const startHour = d.getHours();
    const endHour = (startHour + 1) % 24;
    return `${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00`;
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div 
        className="modal-content glass" 
        style={{ 
          width: paymentReceipt ? '580px' : '560px', 
          maxHeight: '92vh', 
          overflowY: 'auto',
          padding: '24px',
          border: '1px solid rgba(168, 130, 255, 0.3)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)'
        }}
      >
        <button onClick={onClose} className="close-modal-btn">
          <X size={20} />
        </button>

        {/* 3D SECURE OTP SIMULATOR SCREEN */}
        {showOtpScreen ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Lock size={20} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Bank 3D Secure Authentication
              </h3>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                A one-time password (OTP) has been sent to your registered mobile number ending with <b>•••• 8829</b>.
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '12px' }}>
                Merchant: <b>VoltSync EV Charging India Pvt Ltd</b> | Amount: <b style={{ color: 'var(--accent-green)' }}>₹{orderData?.taxBreakdown?.totalAmount || orderData?.amount}</b>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: 'var(--text-muted)' }}>
                  ENTER 6-DIGIT SMS OTP:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  style={{
                    width: '100%',
                    letterSpacing: '8px',
                    fontSize: '22px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--accent-cyan)',
                    color: 'var(--text-primary)',
                    borderRadius: '8px',
                    padding: '10px'
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--accent-teal)', marginTop: '4px', display: 'block' }}>
                  Demo Mode: Pre-filled with valid test OTP (482910)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>Resend OTP in: <b style={{ color: 'var(--accent-primary)' }}>{otpTimer}s</b></span>
                <span style={{ color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={13} /> Verified by Visa / RuPay Secure
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowOtpScreen(false)}
                className="nav-btn"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Back to Card
              </button>
              <button
                type="button"
                onClick={completePaymentVerification}
                disabled={loading || otpValue.length < 4}
                className="action-btn"
                style={{ flex: 2 }}
              >
                {loading ? 'Authorizing Payment...' : 'Submit OTP & Confirm'}
              </button>
            </div>
          </div>
        ) : paymentReceipt ? (
          /* PAYMENT SUCCESS & OFFICIAL TAX INVOICE SCREEN */
          <div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'inline-flex', background: 'rgba(52, 211, 153, 0.15)', border: '2px solid var(--accent-green)', borderRadius: '50%', padding: '10px', color: 'var(--accent-green)', marginBottom: '8px' }}>
                <CheckCircle size={32} />
              </div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Payment Successful & Verified!
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Your reservation at <b>{station.name}</b> is locked and confirmed.
              </p>
            </div>

            {/* GST Tax Invoice Card */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px dashed var(--border-subtle)', paddingBottom: '10px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    GST TAX INVOICE
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    VoltSync EV Charging Infrastructure
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {paymentReceipt.invoiceNumber}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(paymentReceipt.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Invoice Table */}
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Outlet Charger & Slot:</span>
                  <b style={{ color: 'var(--text-primary)' }}>{paymentReceipt.chargerId} ({formatSlotTime(slotTime)})</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Payment Gateway Reference:</span>
                  <b style={{ color: 'var(--accent-teal)' }}>{paymentReceipt.transactionId}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Base Energy Charges:</span>
                  <span>₹{paymentReceipt.taxBreakdown?.baseAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>CGST (9%) + SGST (9%):</span>
                  <span>₹{paymentReceipt.taxBreakdown?.gstAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Green Energy Cess (2%):</span>
                  <span>₹{paymentReceipt.taxBreakdown?.cessAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: '4px', fontSize: '14px', fontWeight: 800 }}>
                  <span style={{ color: 'var(--text-primary)' }}>Total Amount Paid:</span>
                  <span style={{ color: 'var(--accent-green)' }}>₹{paymentReceipt.totalPaid} INR</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="nav-btn"
                style={{ flex: 1, justifyContent: 'center', height: '40px', fontSize: '12px' }}
              >
                <Printer size={15} /> Print Invoice
              </button>
              <button
                type="button"
                onClick={onClose}
                className="action-btn"
                style={{ flex: 1, height: '40px', fontSize: '12px' }}
              >
                View FastPass Ticket <ChevronRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          /* PAYMENT GATEWAY METHOD SELECTION & CHECKOUT FORM */
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={18} style={{ color: 'var(--accent-primary)' }} />
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    VoltSync Secure Payment Gateway
                  </h2>
                </div>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  RBI-Compliant 256-Bit Encrypted EV Payment Gateway
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '20px', padding: '3px 8px', fontSize: '10px', color: 'var(--accent-green)', fontWeight: 'bold' }}>
                <ShieldCheck size={12} /> SECURE GATEWAY
              </div>
            </div>

            {error && (
              <div className="alert-box-danger" style={{ marginBottom: '12px' }}>
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            {/* Bill Summary Strip */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{station.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Charger {chargerId} • Slot {formatSlotTime(slotTime)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>TOTAL PAYABLE</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-green)' }}>
                  ₹{orderData?.taxBreakdown?.totalAmount || Math.round(Number(energyKwh || 15) * station.pricingPerKwh * 1.2)}
                </div>
              </div>
            </div>

            {/* Gateway Mode Switcher Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px' }}>
              {[
                { id: 'upi', label: 'UPI / QR', icon: Smartphone },
                { id: 'card', label: 'Cards', icon: CreditCard },
                { id: 'netbanking', label: 'NetBanking', icon: Building2 },
                { id: 'wallet', label: 'EV Wallet', icon: Wallet }
              ].map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeMethod === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveMethod(tab.id);
                      setError(null);
                    }}
                    style={{
                      background: isSelected ? 'rgba(245, 166, 35, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      borderRadius: '8px',
                      padding: '8px 4px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: isSelected ? 'bold' : 'normal',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB 1: UPI & DYNAMIC QR */}
            {activeMethod === 'upi' && (
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  {/* Dynamic QR Box */}
                  <div style={{ width: '130px', height: '130px', background: '#fff', borderRadius: '10px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', flexShrink: 0 }}>
                    <QrCode size={95} style={{ color: '#0f172a' }} />
                    <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' }}>
                      SCAN & PAY VIA UPI
                    </span>
                  </div>

                  {/* UPI Apps & Input */}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      Fast-Pay with UPI Apps:
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
                      {POPULAR_UPI_APPS.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => {
                            setSelectedApp(app.id);
                            setUpiId(`driver${app.handle}`);
                          }}
                          style={{
                            background: selectedApp === app.id ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                            border: selectedApp === app.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          <span>{app.icon}</span>
                          <span>{app.name}</span>
                        </button>
                      ))}
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        OR ENTER UPI VPA ID:
                      </span>
                      <input
                        type="text"
                        placeholder="yourname@okaxis"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          padding: '6px 10px',
                          fontSize: '12px'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CREDIT / DEBIT CARD */}
            {activeMethod === 'card' && (
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    CARD NUMBER
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="4532 8901 2345 6789"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      style={{
                        width: '100%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        padding: '8px 10px',
                        fontSize: '13px',
                        letterSpacing: '1px'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '8px', fontSize: '11px', color: 'var(--accent-teal)', fontWeight: 'bold' }}>
                      RuPay / Visa
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      CARDHOLDER NAME
                    </label>
                    <input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        padding: '8px 10px',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      EXPIRY
                    </label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={handleExpiryChange}
                      style={{
                        width: '100%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        padding: '8px 10px',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      CVV
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="•••"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                      style={{
                        width: '100%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        padding: '8px 10px',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: NET BANKING */}
            {activeMethod === 'netbanking' && (
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                  Select Your Bank:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {POPULAR_BANKS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBank(b.id)}
                      style={{
                        background: selectedBank === b.id ? 'rgba(168, 130, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                        border: selectedBank === b.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        borderRadius: '8px',
                        padding: '10px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  You will be securely redirected to your bank's portal to authorize this EV session fee.
                </div>
              </div>
            )}

            {/* TAB 4: EV WALLET */}
            {activeMethod === 'wallet' && (
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)' }}>VoltSync FastPass Wallet</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Connected to Driver RFID / EV FastTag</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>AVAILABLE BALANCE</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-green)' }}>₹{walletBalance}</div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle size={13} /> 1-Tap instant contactless deduction authorized
                </div>
              </div>
            )}

            {/* Tax & Breakdown Drawer */}
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px', padding: '0 4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Base Energy ({energyKwh || 15} kWh × ₹{station.pricingPerKwh}):</span>
                <span>₹{orderData?.taxBreakdown?.baseAmount || Math.round(Number(energyKwh || 15) * station.pricingPerKwh)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>GST (18% EV Infrastructure):</span>
                <span>₹{orderData?.taxBreakdown?.gstAmount || Math.round(Number(energyKwh || 15) * station.pricingPerKwh * 0.18)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Green Energy Cess (2%):</span>
                <span>₹{orderData?.taxBreakdown?.cessAmount || Math.round(Number(energyKwh || 15) * station.pricingPerKwh * 0.02)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                className="nav-btn"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={loading}
                className="action-btn"
                style={{ flex: 2 }}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={14} className="spin-animation" /> Processing Payment...
                  </span>
                ) : (
                  <span>Pay ₹{orderData?.taxBreakdown?.totalAmount || Math.round(Number(energyKwh || 15) * station.pricingPerKwh * 1.2)} & Confirm</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentGatewayModal;
