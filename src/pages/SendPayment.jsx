import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useAuthStore } from '../store/authStore'
import useWalletStore from '../store/walletStore'
import { verifyEmailCode, verifyPhoneCode } from '../services/verificationService'
import './SendPayment.css'

/* ═══════════════════════════════════════════════════════
 *  SEND PAYMENT — Buyer → Seller secure transfer
 * ═══════════════════════════════════════════════════════ */
export default function SendPayment() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const email = user?.email || ''

  /* Wallet state */
  const balance = useWalletStore((s) => s.balance)
  const escrowHeld = useWalletStore((s) => s.escrowHeld)
  const security = useWalletStore((s) => s.security)
  const sendPayment = useWalletStore((s) => s.sendPayment)
  const markVerified = useWalletStore((s) => s.markVerified)

  const availableBalance = balance - escrowHeld

  /* Pre-fill from query params */
  const [recipientEmail, setRecipientEmail] = useState(params.get('to') || '')
  const [recipientName, setRecipientName] = useState(params.get('name') || '')
  const [amount, setAmount] = useState(params.get('amount') || '')
  const [description, setDescription] = useState(params.get('desc') || '')
  const [useEscrow, setUseEscrow] = useState(true)
  const [step, setStep] = useState('form')  // form | verify | confirm | done
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyStep, setVerifyStep] = useState('email')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  /* Validate form */
  const validate = () => {
    const amt = parseFloat(amount)
    if (!recipientEmail.trim() || !recipientEmail.includes('@'))
      return 'Enter a valid recipient email'
    if (recipientEmail.toLowerCase() === email.toLowerCase())
      return 'Cannot send payment to yourself'
    if (!amt || amt <= 0) return 'Enter a valid amount'
    if (amt > availableBalance) return 'Insufficient available balance'
    if (amt > security.singleTransactionLimit)
      return `Exceeds single transaction limit ($${security.singleTransactionLimit.toLocaleString()})`
    if (!description.trim()) return 'Enter a payment description'
    return null
  }

  const handleProceedToVerify = () => {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setStep('verify')
    setVerifyStep('email')
    setVerifyCode('')
  }

  const handleVerify = () => {
    if (verifyStep === 'email') {
      if (verifyEmailCode(verifyCode)) {
        if (security.phoneVerified && security.twoFactorEnabled) {
          setVerifyStep('phone')
          setVerifyCode('')
        } else {
          setStep('confirm')
        }
      } else {
        setError('Invalid email verification code.')
      }
    } else if (verifyStep === 'phone') {
      if (verifyPhoneCode(verifyCode)) {
        setStep('confirm')
      } else {
        setError('Invalid phone OTP.')
      }
    }
  }

  const handleConfirmPayment = () => {
    const amt = parseFloat(amount)
    const res = sendPayment(amt, recipientEmail, recipientName || recipientEmail, description, useEscrow)
    if (res.error) {
      setError(res.error)
      setStep('form')
      return
    }
    markVerified()
    setResult(res)
    setStep('done')
  }

  const fmtCurrency = (val) => `$${parseFloat(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

  return (
    <AppLayout>
      <div className="sp-page">
        <button className="sp-back" onClick={() => navigate(-1)}>← Back</button>
        <h1 className="sp-title">Send Payment</h1>
        <p className="sp-subtitle">Secure transfer from your wallet to another account</p>

        {error && <div className="sp-error">{error}</div>}

        {/* Step: Payment Form */}
        {step === 'form' && (
          <div className="sp-card">
            <div className="sp-balance-bar">
              <span>Available Balance</span>
              <strong>{fmtCurrency(availableBalance)}</strong>
            </div>

            <div className="sp-form">
              <div className="sp-field">
                <label>Recipient Email *</label>
                <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="seller@company.com" />
              </div>
              <div className="sp-field">
                <label>Recipient Name</label>
                <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Company or contact name" />
              </div>
              <div className="sp-field">
                <label>Amount (USD) *</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min="0.01" step="0.01" />
              </div>
              <div className="sp-field">
                <label>Description *</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Payment for RFQ, order, service..." rows={3} />
              </div>

              {/* Escrow toggle */}
              <div className="sp-escrow-option">
                <div className="sp-escrow-info">
                  <div className="sp-escrow-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/></svg>
                    Escrow Protection
                  </div>
                  <p className="sp-escrow-desc">
                    Funds are held securely by STREFEX until you confirm delivery. You can dispute and get a refund if needed.
                  </p>
                </div>
                <label className="sp-toggle">
                  <input type="checkbox" checked={useEscrow} onChange={(e) => setUseEscrow(e.target.checked)} />
                  <span className="sp-toggle-slider" />
                </label>
              </div>

              {!useEscrow && (
                <div className="sp-warn-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>
                  <span>Direct payment cannot be reversed. Funds will be sent immediately without escrow protection.</span>
                </div>
              )}

              <div className="sp-form-actions">
                <button className="sp-btn secondary" onClick={() => navigate(-1)}>Cancel</button>
                <button className="sp-btn primary" onClick={handleProceedToVerify}>
                  Continue to Verification →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Security Verification */}
        {step === 'verify' && (
          <div className="sp-card verify-card">
            <div className="sp-verify-icon">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#000888" strokeWidth="1.5"/><path d="M9 12l2 2 4-4" stroke="#000888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 className="sp-verify-title">Security Verification</h2>
            <p className="sp-verify-desc">
              {verifyStep === 'email'
                ? `A verification code has been sent to ${email}`
                : `An OTP has been sent to ${security.phoneNumber}`
              }
            </p>
            <div className="sp-verify-step">
              Step {verifyStep === 'email' ? '1' : '2'} of {security.phoneVerified && security.twoFactorEnabled ? '2' : '1'}
              {' · '}
              {verifyStep === 'email' ? 'Email Verification' : 'Phone OTP'}
            </div>
            <div className="sp-field" style={{ maxWidth: 280, margin: '0 auto' }}>
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                placeholder="000000"
                maxLength={6}
                style={{ textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: 800 }}
                autoFocus
              />
            </div>
            <p className="sp-verify-hint">Your verification code is shown in the input field or console</p>
            <div className="sp-form-actions center">
              <button className="sp-btn secondary" onClick={() => { setStep('form'); setError('') }}>Back</button>
              <button className="sp-btn primary" onClick={handleVerify} disabled={verifyCode.length < 6}>
                Verify
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <div className="sp-card">
            <h2 className="sp-confirm-title">Confirm Payment</h2>
            <div className="sp-confirm-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#27ae60" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="10" stroke="#27ae60" strokeWidth="2"/></svg>
              Identity Verified
            </div>

            <div className="sp-confirm-summary">
              <div className="sp-confirm-row">
                <span>From</span>
                <strong>{email}</strong>
              </div>
              <div className="sp-confirm-row">
                <span>To</span>
                <strong>{recipientName || recipientEmail}</strong>
              </div>
              <div className="sp-confirm-row">
                <span>Recipient Email</span>
                <strong>{recipientEmail}</strong>
              </div>
              <div className="sp-confirm-divider" />
              <div className="sp-confirm-row">
                <span>Amount</span>
                <strong className="sp-confirm-amount">{fmtCurrency(amount)}</strong>
              </div>
              <div className="sp-confirm-row">
                <span>Platform Fee</span>
                <strong>$0.00</strong>
              </div>
              <div className="sp-confirm-row total">
                <span>Total</span>
                <strong>{fmtCurrency(amount)}</strong>
              </div>
              <div className="sp-confirm-divider" />
              <div className="sp-confirm-row">
                <span>Type</span>
                <strong>
                  {useEscrow ? (
                    <span style={{ color: '#1565c0' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: -2 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/></svg>
                      {' '}Escrow Protected
                    </span>
                  ) : 'Direct Transfer'}
                </strong>
              </div>
              <div className="sp-confirm-row">
                <span>Description</span>
                <strong>{description}</strong>
              </div>
            </div>

            <div className="sp-form-actions">
              <button className="sp-btn secondary" onClick={() => setStep('form')}>Edit</button>
              <button className="sp-btn primary large" onClick={handleConfirmPayment}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Confirm & Send {fmtCurrency(amount)}
              </button>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'done' && (
          <div className="sp-card success-card">
            <div className="sp-success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#27ae60" strokeWidth="2"/><path d="M9 12l2 2 4-4" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 className="sp-success-title">Payment Sent Successfully</h2>
            <p className="sp-success-desc">
              {useEscrow
                ? `$${parseFloat(amount).toLocaleString()} is held in escrow. Release it from your wallet once you confirm delivery.`
                : `$${parseFloat(amount).toLocaleString()} has been sent directly to ${recipientName || recipientEmail}.`
              }
            </p>

            {result?.walletTx && (
              <div className="sp-success-ref">
                <span>Reference</span>
                <strong>{result.walletTx.reference}</strong>
              </div>
            )}
            {result?.escrowTx && (
              <div className="sp-success-ref">
                <span>Escrow ID</span>
                <strong>{result.escrowTx.id}</strong>
              </div>
            )}

            <div className="sp-form-actions center">
              <button className="sp-btn secondary" onClick={() => navigate('/wallet')}>Go to Wallet</button>
              <button className="sp-btn primary" onClick={() => { setStep('form'); setAmount(''); setRecipientEmail(''); setRecipientName(''); setDescription(''); setResult(null) }}>
                Send Another
              </button>
            </div>
          </div>
        )}

        {/* Payment security info */}
        <div className="sp-info-section">
          <h3>Payment Security</h3>
          <div className="sp-info-grid">
            <div className="sp-info-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#000888" strokeWidth="2"/></svg>
              <div>
                <strong>Escrow Protection</strong>
                <p>Funds held securely until delivery is confirmed by the buyer</p>
              </div>
            </div>
            <div className="sp-info-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#000888" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#000888" strokeWidth="2"/></svg>
              <div>
                <strong>256-bit Encryption</strong>
                <p>All transactions are encrypted end-to-end with bank-grade security</p>
              </div>
            </div>
            <div className="sp-info-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#000888" strokeWidth="2"/><path d="M22 6l-10 7L2 6" stroke="#000888" strokeWidth="2"/></svg>
              <div>
                <strong>Multi-Factor Auth</strong>
                <p>Email + phone OTP verification for every financial transaction</p>
              </div>
            </div>
            <div className="sp-info-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#000888" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="#000888" strokeWidth="2" strokeLinecap="round"/></svg>
              <div>
                <strong>Real-time Tracking</strong>
                <p>Full audit trail of every transaction in your wallet history</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
