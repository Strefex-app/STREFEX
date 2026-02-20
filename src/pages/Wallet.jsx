import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useAuthStore } from '../store/authStore'
import useWalletStore from '../store/walletStore'
import { sendEmailCode, verifyEmailCode, sendPhoneCode, verifyPhoneCode } from '../services/verificationService'
import './Wallet.css'

/* ── Payment method type metadata ───────────────────── */
const PM_TYPES = [
  { id: 'card',          label: 'Credit / Debit Card',  icon: '💳', fields: ['cardNumber', 'cardHolder', 'expiry', 'cvv'] },
  { id: 'bank_account',  label: 'Bank Account (ACH)',   icon: '🏦', fields: ['bankName', 'accountNumber', 'routingNumber', 'accountHolder'] },
  { id: 'wire_transfer', label: 'Wire Transfer (SWIFT)',icon: '🌐', fields: ['bankName', 'swiftCode', 'iban', 'accountHolder'] },
  { id: 'sepa',          label: 'SEPA Transfer (EU)',    icon: '🇪🇺', fields: ['bankName', 'iban', 'bic', 'accountHolder'] },
  { id: 'paypal',        label: 'PayPal',               icon: '🅿️', fields: ['paypalEmail'] },
  { id: 'stripe',        label: 'Stripe',               icon: '⚡', fields: ['stripeAccountId'] },
  { id: 'google_pay',    label: 'Google Pay',            icon: '🤖', fields: ['googleEmail'] },
  { id: 'apple_pay',     label: 'Apple Pay',             icon: '🍎', fields: ['appleId'] },
  { id: 'crypto_btc',    label: 'Bitcoin (BTC)',         icon: '₿',  fields: ['walletAddress'] },
  { id: 'crypto_eth',    label: 'Ethereum (ETH)',        icon: 'Ξ',  fields: ['walletAddress'] },
  { id: 'crypto_usdt',   label: 'Tether (USDT)',         icon: '₮',  fields: ['walletAddress', 'network'] },
]

const FIELD_LABELS = {
  cardNumber: 'Card Number', cardHolder: 'Cardholder Name', expiry: 'Expiry (MM/YY)', cvv: 'CVV',
  bankName: 'Bank Name', accountNumber: 'Account Number', routingNumber: 'Routing Number',
  accountHolder: 'Account Holder', swiftCode: 'SWIFT / BIC Code', iban: 'IBAN',
  bic: 'BIC', paypalEmail: 'PayPal Email', stripeAccountId: 'Stripe Account ID',
  googleEmail: 'Google Email', appleId: 'Apple ID', walletAddress: 'Wallet Address', network: 'Network (ERC-20/TRC-20)',
}

const TX_TYPE_META = {
  top_up:           { label: 'Top Up',           color: '#2e7d32', sign: '+' },
  withdrawal:       { label: 'Withdrawal',       color: '#c62828', sign: '-' },
  payment_sent:     { label: 'Payment Sent',     color: '#e65100', sign: '-' },
  payment_received: { label: 'Payment Received', color: '#2e7d32', sign: '+' },
  escrow_lock:      { label: 'Escrow Locked',    color: '#1565c0', sign: '⊖' },
  escrow_release:   { label: 'Escrow Released',  color: '#7b1fa2', sign: '-' },
  escrow_refund:    { label: 'Escrow Refund',    color: '#2e7d32', sign: '+' },
  fee:              { label: 'Platform Fee',      color: '#888',    sign: '-' },
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const maskCard = (num) => {
  if (!num) return '****'
  const clean = num.replace(/\s/g, '')
  return `•••• •••• •••• ${clean.slice(-4)}`
}

/* ═══════════════════════════════════════════════════════
 *  WALLET PAGE
 * ═══════════════════════════════════════════════════════ */
export default function Wallet() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const email = user?.email || ''

  /* Store */
  const balance = useWalletStore((s) => s.balance)
  const currency = useWalletStore((s) => s.currency)
  const escrowHeld = useWalletStore((s) => s.escrowHeld)
  const totalDeposited = useWalletStore((s) => s.totalDeposited)
  const totalWithdrawn = useWalletStore((s) => s.totalWithdrawn)
  const totalSent = useWalletStore((s) => s.totalSent)
  const totalReceived = useWalletStore((s) => s.totalReceived)
  const paymentMethods = useWalletStore((s) => s.paymentMethods)
  const transactions = useWalletStore((s) => s.transactions)
  const escrowTransactions = useWalletStore((s) => s.escrowTransactions)
  const securitySettings = useWalletStore((s) => s.security)

  const topUp = useWalletStore((s) => s.topUp)
  const withdraw = useWalletStore((s) => s.withdraw)
  const addPaymentMethod = useWalletStore((s) => s.addPaymentMethod)
  const removePaymentMethod = useWalletStore((s) => s.removePaymentMethod)
  const setDefaultPaymentMethod = useWalletStore((s) => s.setDefaultPaymentMethod)
  const releaseEscrow = useWalletStore((s) => s.releaseEscrow)
  const refundEscrow = useWalletStore((s) => s.refundEscrow)
  const updateSecurity = useWalletStore((s) => s.updateSecurity)
  const verifyPhone = useWalletStore((s) => s.verifyPhone)

  /* Local state */
  const [tab, setTab] = useState('overview')
  const [showTopUp, setShowTopUp] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showAddMethod, setShowAddMethod] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyAction, setVerifyAction] = useState(null) // { type, callback }
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyStep, setVerifyStep] = useState('email') // 'email' | 'phone' | 'pin'
  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpMethod, setTopUpMethod] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawMethod, setWithdrawMethod] = useState('')
  const [newMethodType, setNewMethodType] = useState('')
  const [newMethodFields, setNewMethodFields] = useState({})
  const [newMethodDefault, setNewMethodDefault] = useState(false)
  const [txFilter, setTxFilter] = useState('all')
  const [phoneInput, setPhoneInput] = useState(securitySettings.phoneNumber || '')
  const [showPhoneSetup, setShowPhoneSetup] = useState(false)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [feedback, setFeedback] = useState(null)

  const availableBalance = balance - escrowHeld
  const activeEscrows = escrowTransactions.filter((e) => e.status === 'funded')

  /* Filtered transactions */
  const filteredTx = useMemo(() => {
    if (txFilter === 'all') return transactions
    return transactions.filter((t) => t.type === txFilter)
  }, [transactions, txFilter])

  /* ── Security verification flow ─────────────────────── */
  const requireVerification = (actionLabel, callback) => {
    setVerifyAction({ type: actionLabel, callback })
    setVerifyStep('email')
    setVerifyCode('')
    setShowVerifyModal(true)
  }

  const handleVerifySubmit = () => {
    if (verifyStep === 'email') {
      if (verifyEmailCode(verifyCode)) {
        if (securitySettings.phoneVerified && securitySettings.twoFactorEnabled) {
          setVerifyStep('phone')
          setVerifyCode('')
        } else {
          setShowVerifyModal(false)
          verifyAction?.callback()
        }
      } else {
        setFeedback({ type: 'error', text: 'Invalid email verification code.' })
        setTimeout(() => setFeedback(null), 3000)
      }
    } else if (verifyStep === 'phone') {
      if (verifyPhoneCode(verifyCode)) {
        setShowVerifyModal(false)
        verifyAction?.callback()
      } else {
        setFeedback({ type: 'error', text: 'Invalid phone OTP.' })
        setTimeout(() => setFeedback(null), 3000)
      }
    }
  }

  /* ── Top-up handler ─────────────────────────────────── */
  const handleTopUp = () => {
    const amt = parseFloat(topUpAmount)
    if (!amt || amt <= 0) return setFeedback({ type: 'error', text: 'Enter a valid amount' })
    if (!topUpMethod) return setFeedback({ type: 'error', text: 'Select a payment method' })

    requireVerification('Top Up', () => {
      topUp(amt, topUpMethod, `Top up via ${paymentMethods.find(m => m.id === topUpMethod)?.label || 'method'}`)
      setTopUpAmount('')
      setShowTopUp(false)
      setFeedback({ type: 'success', text: `Successfully topped up $${amt.toLocaleString()}` })
      setTimeout(() => setFeedback(null), 4000)
    })
  }

  /* ── Withdraw handler ───────────────────────────────── */
  const handleWithdraw = () => {
    const amt = parseFloat(withdrawAmount)
    if (!amt || amt <= 0) return setFeedback({ type: 'error', text: 'Enter a valid amount' })
    if (amt > availableBalance) return setFeedback({ type: 'error', text: 'Insufficient available balance' })
    if (!withdrawMethod) return setFeedback({ type: 'error', text: 'Select a withdrawal method' })

    requireVerification('Withdrawal', () => {
      const result = withdraw(amt, withdrawMethod, `Withdrawal to ${paymentMethods.find(m => m.id === withdrawMethod)?.label || 'account'}`)
      if (result.error) {
        setFeedback({ type: 'error', text: result.error })
      } else {
        setWithdrawAmount('')
        setShowWithdraw(false)
        setFeedback({ type: 'success', text: `Withdrawal of $${amt.toLocaleString()} is processing` })
      }
      setTimeout(() => setFeedback(null), 4000)
    })
  }

  /* ── Add payment method ─────────────────────────────── */
  const handleAddMethod = () => {
    if (!newMethodType) return
    const typeMeta = PM_TYPES.find((t) => t.id === newMethodType)
    if (!typeMeta) return

    const missingField = typeMeta.fields.find((f) => !newMethodFields[f]?.trim())
    if (missingField) {
      setFeedback({ type: 'error', text: `Please fill in ${FIELD_LABELS[missingField]}` })
      setTimeout(() => setFeedback(null), 3000)
      return
    }

    const label = newMethodType === 'card'
      ? `${typeMeta.label} ${maskCard(newMethodFields.cardNumber)}`
      : newMethodType.startsWith('crypto')
        ? `${typeMeta.label} ${newMethodFields.walletAddress?.slice(0, 8)}...`
        : `${typeMeta.label} — ${newMethodFields.bankName || newMethodFields.paypalEmail || newMethodFields.googleEmail || newMethodFields.appleId || newMethodFields.stripeAccountId || ''}`

    addPaymentMethod({
      type: newMethodType,
      label,
      details: { ...newMethodFields },
      isDefault: newMethodDefault || paymentMethods.length === 0,
    })

    setNewMethodType('')
    setNewMethodFields({})
    setNewMethodDefault(false)
    setShowAddMethod(false)
    setFeedback({ type: 'success', text: 'Payment method added successfully' })
    setTimeout(() => setFeedback(null), 3000)
  }

  /* ── Phone setup ────────────────────────────────────── */
  const handlePhoneSetup = () => {
    if (!phoneInput.trim() || phoneInput.length < 8) {
      setFeedback({ type: 'error', text: 'Enter a valid phone number' })
      setTimeout(() => setFeedback(null), 3000)
      return
    }
    if (verifyPhoneCode(phoneOtp)) {
      verifyPhone(phoneInput)
      setShowPhoneSetup(false)
      setFeedback({ type: 'success', text: 'Phone verified successfully' })
      setTimeout(() => setFeedback(null), 3000)
    } else {
      setFeedback({ type: 'error', text: 'Invalid OTP.' })
      setTimeout(() => setFeedback(null), 3000)
    }
  }

  /* ═══════════════════════════════════════════════════════
   *  RENDER: OVERVIEW TAB
   * ═══════════════════════════════════════════════════════ */
  const renderOverview = () => (
    <>
      {/* Balance card */}
      <div className="wal-balance-card">
        <div className="wal-balance-top">
          <div className="wal-balance-label">Available Balance</div>
          <div className="wal-balance-badges">
            {securitySettings.twoFactorEnabled && <span className="wal-sec-badge green">2FA Enabled</span>}
            {securitySettings.phoneVerified && <span className="wal-sec-badge blue">Phone Verified</span>}
            {securitySettings.emailVerified && <span className="wal-sec-badge purple">Email Verified</span>}
          </div>
        </div>
        <div className="wal-balance-amount">${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div className="wal-balance-currency">{currency}</div>
        {escrowHeld > 0 && (
          <div className="wal-escrow-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2"/></svg>
            ${escrowHeld.toLocaleString()} held in escrow
          </div>
        )}
        <div className="wal-balance-actions">
          <button className="wal-btn primary" onClick={() => setShowTopUp(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Top Up
          </button>
          <button className="wal-btn secondary" onClick={() => setShowWithdraw(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Withdraw
          </button>
          <button className="wal-btn accent" onClick={() => navigate('/send-payment')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Send Payment
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="wal-stats-row">
        <div className="wal-stat">
          <div className="wal-stat-val" style={{ color: '#2e7d32' }}>${totalDeposited.toLocaleString()}</div>
          <div className="wal-stat-label">Total Deposited</div>
        </div>
        <div className="wal-stat">
          <div className="wal-stat-val" style={{ color: '#c62828' }}>${totalWithdrawn.toLocaleString()}</div>
          <div className="wal-stat-label">Total Withdrawn</div>
        </div>
        <div className="wal-stat">
          <div className="wal-stat-val" style={{ color: '#e65100' }}>${totalSent.toLocaleString()}</div>
          <div className="wal-stat-label">Total Sent</div>
        </div>
        <div className="wal-stat">
          <div className="wal-stat-val" style={{ color: '#1565c0' }}>${totalReceived.toLocaleString()}</div>
          <div className="wal-stat-label">Total Received</div>
        </div>
      </div>

      {/* Active escrows */}
      {activeEscrows.length > 0 && (
        <div className="wal-section">
          <h3 className="wal-section-title">Active Escrow Transactions</h3>
          <div className="wal-escrow-list">
            {activeEscrows.map((esc) => (
              <div key={esc.id} className="wal-escrow-item">
                <div className="wal-escrow-item-info">
                  <div className="wal-escrow-item-title">{esc.description}</div>
                  <div className="wal-escrow-item-meta">To: {esc.sellerName || esc.sellerEmail} · {fmtDate(esc.fundedAt)}</div>
                </div>
                <div className="wal-escrow-item-amount">${esc.amount.toLocaleString()}</div>
                <div className="wal-escrow-item-actions">
                  <button className="wal-btn-sm green" onClick={() => requireVerification('Release Escrow', () => {
                    releaseEscrow(esc.id)
                    setFeedback({ type: 'success', text: 'Escrow released to seller' })
                    setTimeout(() => setFeedback(null), 4000)
                  })}>Release</button>
                  <button className="wal-btn-sm red" onClick={() => requireVerification('Refund Escrow', () => {
                    refundEscrow(esc.id, 'Buyer requested refund')
                    setFeedback({ type: 'success', text: 'Escrow refunded' })
                    setTimeout(() => setFeedback(null), 4000)
                  })}>Dispute</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="wal-section">
        <div className="wal-section-header">
          <h3 className="wal-section-title">Recent Transactions</h3>
          <button className="wal-link" onClick={() => setTab('transactions')}>View All →</button>
        </div>
        {transactions.length === 0 ? (
          <div className="wal-empty">No transactions yet. Top up your balance to get started.</div>
        ) : (
          <div className="wal-tx-list">
            {transactions.slice(0, 6).map((tx) => {
              const meta = TX_TYPE_META[tx.type] || TX_TYPE_META.fee
              return (
                <div key={tx.id} className="wal-tx-item">
                  <div className="wal-tx-icon" style={{ background: `${meta.color}12`, color: meta.color }}>{meta.sign}</div>
                  <div className="wal-tx-info">
                    <div className="wal-tx-desc">{tx.description}</div>
                    <div className="wal-tx-meta">{meta.label} · {fmtDate(tx.createdAt)}</div>
                  </div>
                  <div className="wal-tx-amount" style={{ color: meta.color }}>
                    {meta.sign === '+' ? '+' : meta.sign === '-' ? '-' : ''} ${tx.amount?.toLocaleString()}
                  </div>
                  <span className={`wal-tx-status ${tx.status}`}>{tx.status}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════════════
   *  RENDER: PAYMENT METHODS TAB
   * ═══════════════════════════════════════════════════════ */
  const renderPaymentMethods = () => (
    <div className="wal-section">
      <div className="wal-section-header">
        <h3 className="wal-section-title">Payment Methods</h3>
        <button className="wal-btn primary small" onClick={() => setShowAddMethod(true)}>+ Add Method</button>
      </div>

      {paymentMethods.length === 0 ? (
        <div className="wal-empty-card">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: '#ccc', marginBottom: 12 }}>
            <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#555' }}>No payment methods added yet</p>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Add a credit card, bank account, or digital wallet to start using your wallet</p>
          <button className="wal-btn primary" style={{ marginTop: 16 }} onClick={() => setShowAddMethod(true)}>Add Your First Method</button>
        </div>
      ) : (
        <div className="wal-methods-grid">
          {paymentMethods.map((m) => {
            const typeMeta = PM_TYPES.find((t) => t.id === m.type) || { icon: '💳', label: m.type }
            return (
              <div key={m.id} className={`wal-method-card ${m.isDefault ? 'default' : ''}`}>
                <div className="wal-method-top">
                  <span className="wal-method-icon">{typeMeta.icon}</span>
                  <div className="wal-method-badges">
                    {m.isDefault && <span className="wal-badge green">Default</span>}
                    {m.verified ? <span className="wal-badge blue">Verified</span> : <span className="wal-badge orange">Unverified</span>}
                  </div>
                </div>
                <div className="wal-method-label">{m.label}</div>
                <div className="wal-method-type">{typeMeta.label}</div>
                <div className="wal-method-date">Added {fmtDate(m.addedAt)}</div>
                <div className="wal-method-actions">
                  {!m.isDefault && (
                    <button className="wal-btn-sm blue" onClick={() => setDefaultPaymentMethod(m.id)}>Set Default</button>
                  )}
                  <button className="wal-btn-sm red" onClick={() => {
                    requireVerification('Remove Payment Method', () => {
                      removePaymentMethod(m.id)
                      setFeedback({ type: 'success', text: 'Payment method removed' })
                      setTimeout(() => setFeedback(null), 3000)
                    })
                  }}>Remove</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Supported methods info */}
      <div className="wal-supported-info">
        <h4>Supported Payment Methods</h4>
        <div className="wal-supported-grid">
          {PM_TYPES.map((pm) => (
            <div key={pm.id} className="wal-supported-item">
              <span className="wal-supported-icon">{pm.icon}</span>
              <span>{pm.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  /* ═══════════════════════════════════════════════════════
   *  RENDER: TRANSACTIONS TAB
   * ═══════════════════════════════════════════════════════ */
  const renderTransactions = () => (
    <div className="wal-section">
      <div className="wal-section-header">
        <h3 className="wal-section-title">Transaction History</h3>
        <select className="wal-filter-select" value={txFilter} onChange={(e) => setTxFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="top_up">Top Ups</option>
          <option value="withdrawal">Withdrawals</option>
          <option value="payment_sent">Sent</option>
          <option value="payment_received">Received</option>
          <option value="escrow_lock">Escrow Locked</option>
          <option value="escrow_release">Escrow Released</option>
          <option value="escrow_refund">Refunds</option>
        </select>
      </div>

      {filteredTx.length === 0 ? (
        <div className="wal-empty">No transactions match the selected filter.</div>
      ) : (
        <div className="wal-tx-list full">
          {filteredTx.map((tx) => {
            const meta = TX_TYPE_META[tx.type] || TX_TYPE_META.fee
            return (
              <div key={tx.id} className="wal-tx-item">
                <div className="wal-tx-icon" style={{ background: `${meta.color}12`, color: meta.color }}>{meta.sign}</div>
                <div className="wal-tx-info">
                  <div className="wal-tx-desc">{tx.description}</div>
                  <div className="wal-tx-meta">
                    {meta.label} · {fmtDate(tx.createdAt)}
                    {tx.counterparty && <span> · {tx.counterparty.name || tx.counterparty.email}</span>}
                  </div>
                  <div className="wal-tx-ref">Ref: {tx.reference}</div>
                </div>
                <div className="wal-tx-amount" style={{ color: meta.color }}>
                  {meta.sign === '+' ? '+' : meta.sign === '-' ? '-' : ''} ${tx.amount?.toLocaleString()}
                </div>
                <span className={`wal-tx-status ${tx.status}`}>{tx.status}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  /* ═══════════════════════════════════════════════════════
   *  RENDER: SECURITY TAB
   * ═══════════════════════════════════════════════════════ */
  const renderSecurity = () => (
    <div className="wal-section">
      <h3 className="wal-section-title">Wallet Security & Authentication</h3>

      {/* Security status cards */}
      <div className="wal-sec-grid">
        <div className={`wal-sec-card ${securitySettings.emailVerified ? 'ok' : 'warn'}`}>
          <div className="wal-sec-card-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2"/><path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="wal-sec-card-info">
            <div className="wal-sec-card-title">Email Verification</div>
            <div className="wal-sec-card-desc">{email}</div>
          </div>
          <span className={`wal-badge ${securitySettings.emailVerified ? 'green' : 'red'}`}>
            {securitySettings.emailVerified ? 'Verified' : 'Not Verified'}
          </span>
        </div>

        <div className={`wal-sec-card ${securitySettings.phoneVerified ? 'ok' : 'warn'}`}>
          <div className="wal-sec-card-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M12 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="wal-sec-card-info">
            <div className="wal-sec-card-title">Phone Verification</div>
            <div className="wal-sec-card-desc">{securitySettings.phoneVerified ? securitySettings.phoneNumber : 'Not configured'}</div>
          </div>
          {securitySettings.phoneVerified ? (
            <span className="wal-badge green">Verified</span>
          ) : (
            <button className="wal-btn-sm blue" onClick={() => setShowPhoneSetup(true)}>Setup</button>
          )}
        </div>

        <div className={`wal-sec-card ${securitySettings.twoFactorEnabled ? 'ok' : 'warn'}`}>
          <div className="wal-sec-card-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/></svg>
          </div>
          <div className="wal-sec-card-info">
            <div className="wal-sec-card-title">Two-Factor Authentication</div>
            <div className="wal-sec-card-desc">Email + Phone OTP for sensitive operations</div>
          </div>
          <label className="wal-toggle">
            <input
              type="checkbox"
              checked={securitySettings.twoFactorEnabled}
              onChange={(e) => {
                if (!securitySettings.phoneVerified && e.target.checked) {
                  setFeedback({ type: 'error', text: 'Verify your phone number first to enable 2FA' })
                  setTimeout(() => setFeedback(null), 3000)
                  return
                }
                updateSecurity({ twoFactorEnabled: e.target.checked })
              }}
            />
            <span className="wal-toggle-slider" />
          </label>
        </div>
      </div>

      {/* Transaction limits */}
      <div className="wal-sec-limits">
        <h4>Transaction Limits</h4>
        <div className="wal-sec-limits-grid">
          <div className="wal-sec-limit-item">
            <span>Daily Transaction Limit</span>
            <strong>${securitySettings.dailyLimit.toLocaleString()}</strong>
          </div>
          <div className="wal-sec-limit-item">
            <span>Single Transaction Limit</span>
            <strong>${securitySettings.singleTransactionLimit.toLocaleString()}</strong>
          </div>
          <div className="wal-sec-limit-item">
            <span>Withdrawal Requires 2FA</span>
            <label className="wal-toggle small">
              <input type="checkbox" checked={securitySettings.withdrawalRequires2FA} onChange={(e) => updateSecurity({ withdrawalRequires2FA: e.target.checked })} />
              <span className="wal-toggle-slider" />
            </label>
          </div>
          <div className="wal-sec-limit-item">
            <span>Payment Requires 2FA</span>
            <label className="wal-toggle small">
              <input type="checkbox" checked={securitySettings.paymentRequires2FA} onChange={(e) => updateSecurity({ paymentRequires2FA: e.target.checked })} />
              <span className="wal-toggle-slider" />
            </label>
          </div>
          <div className="wal-sec-limit-item">
            <span>Login Alerts</span>
            <label className="wal-toggle small">
              <input type="checkbox" checked={securitySettings.loginAlerts} onChange={(e) => updateSecurity({ loginAlerts: e.target.checked })} />
              <span className="wal-toggle-slider" />
            </label>
          </div>
          <div className="wal-sec-limit-item">
            <span>Transaction Alerts</span>
            <label className="wal-toggle small">
              <input type="checkbox" checked={securitySettings.transactionAlerts} onChange={(e) => updateSecurity({ transactionAlerts: e.target.checked })} />
              <span className="wal-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* Security tips */}
      <div className="wal-sec-tips">
        <h4>Security Recommendations</h4>
        <ul>
          {!securitySettings.phoneVerified && <li className="warn">Verify your phone number for enhanced security</li>}
          {!securitySettings.twoFactorEnabled && <li className="warn">Enable Two-Factor Authentication (2FA) for all financial operations</li>}
          <li>Never share your verification codes with anyone</li>
          <li>Use strong, unique passwords for your account</li>
          <li>Review your transaction history regularly</li>
          <li>Report any suspicious activity immediately</li>
        </ul>
      </div>
    </div>
  )

  /* ═══════════════════════════════════════════════════════
   *  MODALS
   * ═══════════════════════════════════════════════════════ */
  const selectedTypeMeta = PM_TYPES.find((t) => t.id === newMethodType)

  return (
    <AppLayout>
      <div className="wal-page">
        {/* Feedback banner */}
        {feedback && (
          <div className={`wal-feedback ${feedback.type}`}>{feedback.text}</div>
        )}

        {/* Header */}
        <div className="wal-header">
          <div>
            <button className="wal-back" onClick={() => navigate(-1)}>← Back</button>
            <h1 className="wal-title">My Wallet</h1>
            <p className="wal-subtitle">Secure balance management, payments, and transfers</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="wal-tabs">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'payment-methods', label: 'Payment Methods' },
            { id: 'transactions', label: 'Transactions' },
            { id: 'security', label: 'Security' },
          ].map((t) => (
            <button key={t.id} className={`wal-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview' && renderOverview()}
        {tab === 'payment-methods' && renderPaymentMethods()}
        {tab === 'transactions' && renderTransactions()}
        {tab === 'security' && renderSecurity()}

        {/* ── TOP UP MODAL ─────────────────────────────────── */}
        {showTopUp && (
          <div className="wal-modal-overlay" onClick={() => setShowTopUp(false)}>
            <div className="wal-modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="wal-modal-title">Top Up Balance</h2>
              <div className="wal-modal-field">
                <label>Amount (USD)</label>
                <input type="number" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="0.00" min="1" step="0.01" />
              </div>
              <div className="wal-modal-field">
                <label>Payment Method</label>
                {paymentMethods.length === 0 ? (
                  <p className="wal-modal-hint">No payment methods. <button className="wal-link" onClick={() => { setShowTopUp(false); setShowAddMethod(true) }}>Add one first</button></p>
                ) : (
                  <select value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value)}>
                    <option value="">Select method...</option>
                    {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                )}
              </div>
              <div className="wal-quick-amounts">
                {[100, 500, 1000, 5000, 10000].map((a) => (
                  <button key={a} className="wal-quick-btn" onClick={() => setTopUpAmount(String(a))}>${a.toLocaleString()}</button>
                ))}
              </div>
              <div className="wal-modal-actions">
                <button className="wal-btn secondary" onClick={() => setShowTopUp(false)}>Cancel</button>
                <button className="wal-btn primary" onClick={handleTopUp}>Top Up</button>
              </div>
            </div>
          </div>
        )}

        {/* ── WITHDRAW MODAL ───────────────────────────────── */}
        {showWithdraw && (
          <div className="wal-modal-overlay" onClick={() => setShowWithdraw(false)}>
            <div className="wal-modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="wal-modal-title">Withdraw Funds</h2>
              <div className="wal-modal-info">Available: <strong>${availableBalance.toLocaleString()}</strong></div>
              <div className="wal-modal-field">
                <label>Amount (USD)</label>
                <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" min="1" max={availableBalance} step="0.01" />
              </div>
              <div className="wal-modal-field">
                <label>Withdraw To</label>
                {paymentMethods.length === 0 ? (
                  <p className="wal-modal-hint">No withdrawal methods. <button className="wal-link" onClick={() => { setShowWithdraw(false); setShowAddMethod(true) }}>Add one first</button></p>
                ) : (
                  <select value={withdrawMethod} onChange={(e) => setWithdrawMethod(e.target.value)}>
                    <option value="">Select method...</option>
                    {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                )}
              </div>
              <div className="wal-modal-actions">
                <button className="wal-btn secondary" onClick={() => setShowWithdraw(false)}>Cancel</button>
                <button className="wal-btn primary" onClick={handleWithdraw}>Withdraw</button>
              </div>
            </div>
          </div>
        )}

        {/* ── ADD PAYMENT METHOD MODAL ─────────────────────── */}
        {showAddMethod && (
          <div className="wal-modal-overlay" onClick={() => setShowAddMethod(false)}>
            <div className="wal-modal wide" onClick={(e) => e.stopPropagation()}>
              <h2 className="wal-modal-title">Add Payment Method</h2>
              <div className="wal-modal-field">
                <label>Method Type</label>
                <select value={newMethodType} onChange={(e) => { setNewMethodType(e.target.value); setNewMethodFields({}) }}>
                  <option value="">Select type...</option>
                  {PM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                </select>
              </div>

              {selectedTypeMeta && (
                <div className="wal-method-form-fields">
                  {selectedTypeMeta.fields.map((field) => (
                    <div key={field} className="wal-modal-field">
                      <label>{FIELD_LABELS[field]}</label>
                      <input
                        type={field === 'cvv' ? 'password' : field === 'cardNumber' ? 'text' : 'text'}
                        placeholder={FIELD_LABELS[field]}
                        value={newMethodFields[field] || ''}
                        onChange={(e) => setNewMethodFields({ ...newMethodFields, [field]: e.target.value })}
                        maxLength={field === 'cvv' ? 4 : field === 'cardNumber' ? 19 : undefined}
                      />
                    </div>
                  ))}
                  <label className="wal-checkbox-label">
                    <input type="checkbox" checked={newMethodDefault} onChange={(e) => setNewMethodDefault(e.target.checked)} />
                    Set as default payment method
                  </label>
                </div>
              )}

              <div className="wal-modal-actions">
                <button className="wal-btn secondary" onClick={() => setShowAddMethod(false)}>Cancel</button>
                <button className="wal-btn primary" onClick={handleAddMethod} disabled={!newMethodType}>Add Method</button>
              </div>
            </div>
          </div>
        )}

        {/* ── SECURITY VERIFICATION MODAL ──────────────────── */}
        {showVerifyModal && (
          <div className="wal-modal-overlay">
            <div className="wal-modal verify" onClick={(e) => e.stopPropagation()}>
              <div className="wal-verify-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#000888" strokeWidth="2"/><path d="M9 12l2 2 4-4" stroke="#000888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="wal-modal-title">Security Verification</h2>
              <p className="wal-verify-desc">
                {verifyStep === 'email'
                  ? `Enter the 6-digit code sent to ${email}`
                  : `Enter the OTP sent to ${securitySettings.phoneNumber}`
                }
              </p>
              <div className="wal-verify-step-badge">
                Step {verifyStep === 'email' ? '1' : '2'} of {securitySettings.phoneVerified && securitySettings.twoFactorEnabled ? '2' : '1'}
                {' — '}
                {verifyStep === 'email' ? 'Email Verification' : 'Phone OTP'}
              </div>
              <div className="wal-modal-field">
                <label>{verifyStep === 'email' ? 'Email Code' : 'Phone OTP'}</label>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                  autoFocus
                />
              </div>
              <p className="wal-verify-hint">Your verification code is shown in the input field or console</p>
              <div className="wal-modal-actions">
                <button className="wal-btn secondary" onClick={() => setShowVerifyModal(false)}>Cancel</button>
                <button className="wal-btn primary" onClick={handleVerifySubmit} disabled={verifyCode.length < 6}>
                  Verify & {verifyAction?.type}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PHONE SETUP MODAL ────────────────────────────── */}
        {showPhoneSetup && (
          <div className="wal-modal-overlay" onClick={() => setShowPhoneSetup(false)}>
            <div className="wal-modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="wal-modal-title">Setup Phone Verification</h2>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                Add your phone number for 2FA security on withdrawals and payments.
              </p>
              <div className="wal-modal-field">
                <label>Phone Number</label>
                <input type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="+1 (555) 123-4567" />
              </div>
              <div className="wal-modal-field">
                <label>Verification Code</label>
                <input
                  type="text"
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter OTP"
                  maxLength={6}
                />
              </div>
              <p className="wal-verify-hint">Your verification code is shown in the input field or console</p>
              <div className="wal-modal-actions">
                <button className="wal-btn secondary" onClick={() => setShowPhoneSetup(false)}>Cancel</button>
                <button className="wal-btn primary" onClick={handlePhoneSetup}>Verify Phone</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
