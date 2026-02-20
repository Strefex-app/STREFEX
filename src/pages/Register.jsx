import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useTranslation } from '../i18n/useTranslation'
import { getStripe, isStripeConfigured } from '../config/stripe'
import { billingApi } from '../services/api'
import authService from '../services/authService'
import { PLANS, ACCOUNT_TYPES, getPlansForAccountType, getPlanPrice, getPlanFeatures } from '../services/stripeService'
import { analytics } from '../services/analytics'
import { useAccountRegistry } from '../store/accountRegistry'
import {
  sendEmailCode,
  verifyEmailCode,
  sendPhoneCode,
  verifyPhoneCode,
  clearPendingVerification,
} from '../services/verificationService'
import './Login.css'
import './Register.css'

/* ── Stripe Card Element styling ─────────────────────────── */
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#333',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      '::placeholder': { color: '#aab7c4' },
    },
    invalid: { color: '#e74c3c' },
  },
}

/* ── Inner form (needs Stripe context) ───────────────────── */
function RegisterForm() {
  const [step, setStep] = useState(1) // 1 = account, 2 = plan, 3 = verify
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [company, setCompany] = useState('')
  const [accountType, setAccountType] = useState('seller')
  const [selectedPlan, setSelectedPlan] = useState('start')
  const [error, setError] = useState('')
  const [domainWarning, setDomainWarning] = useState('')
  const [loading, setLoading] = useState(false)
  const [cardComplete, setCardComplete] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showAgreementModal, setShowAgreementModal] = useState(false)

  // Verification state
  const [verifyStep, setVerifyStep] = useState('email') // 'email' | 'phone'
  const [emailCode, setEmailCode] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [emailCodeGenerated, setEmailCodeGenerated] = useState('')
  const [phoneCodeGenerated, setPhoneCodeGenerated] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [verifyTimer, setVerifyTimer] = useState(300)
  const timerRef = useRef(null)

  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setPlan = useSubscriptionStore((s) => s.setPlan)
  const setStoreAccountType = useSubscriptionStore((s) => s.setAccountType)
  const theme = useSettingsStore((s) => s.theme)
  const { t } = useTranslation()
  const stripe = useStripe()
  const elements = useElements()

  const availablePlans = getPlansForAccountType(accountType)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (isAuthenticated) navigate('/main-menu', { replace: true })
  }, [isAuthenticated, navigate])

  const selectedPlanObj = PLANS.find((p) => p.id === selectedPlan) || PLANS[0]
  const displayPrice = getPlanPrice(selectedPlanObj, accountType)
  const isPaidPlan = displayPrice > 0

  const getDomain = (e) => {
    if (!e || !e.includes('@')) return null
    const domain = e.split('@')[1]?.toLowerCase()
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'mail.com', 'protonmail.com']
    if (freeProviders.includes(domain)) return null
    return domain
  }

  useEffect(() => {
    setDomainWarning('')
    const domain = getDomain(email)
    if (!domain || !accountType) return
    const registry = useAccountRegistry.getState().accounts
    const existing = registry.find((a) =>
      a.accountType === accountType &&
      a.email?.includes('@' + domain) &&
      a.status !== 'canceled'
    )
    if (existing) {
      setDomainWarning(
        `A ${accountType === 'service_provider' ? 'Service Provider' : accountType.charAt(0).toUpperCase() + accountType.slice(1)} account for @${domain} already exists (${existing.company}). ` +
        'Each business domain can have only one account per direction. Ask your admin to invite you as a team member instead.'
      )
    }
  }, [email, accountType])

  const handleAccountTypeChange = (type) => {
    setAccountType(type)
    if (type === 'buyer') {
      setSelectedPlan('basic')
    } else {
      setSelectedPlan('start')
    }
  }

  const accountTypeLabel = ACCOUNT_TYPES.find((t) => t.id === accountType)?.label || accountType

  /* ── Timer for verification codes ────────────────────────── */
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current)
    setVerifyTimer(300)
    timerRef.current = setInterval(() => {
      setVerifyTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => clearInterval(timerRef.current), [])

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  /* ── Step 1 validation ─────────────────────────────────── */
  const validateAccount = () => {
    if (!fullName.trim() || fullName.trim().length < 2) return 'Full name must be at least 2 characters'
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address'
    if (!phone.trim() || phone.trim().length < 7) return 'Please enter a valid phone number (minimum 7 digits)'
    if (!/^[+\d\s\-()]+$/.test(phone.trim())) return 'Phone number can only contain digits, spaces, dashes, and parentheses'
    if (!password || password.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
    if (password !== confirmPassword) return 'Passwords do not match'
    if (!agreedToTerms) return 'You must accept the Platform Agreement & NDA to continue'
    const domain = getDomain(email)
    if (domain) {
      const registry = useAccountRegistry.getState().accounts
      const existing = registry.find((a) =>
        a.accountType === accountType &&
        a.email?.includes('@' + domain) &&
        a.status !== 'canceled'
      )
      if (existing) {
        return `A ${accountTypeLabel} account for @${domain} already exists. Ask your admin to invite you as a team member.`
      }
    }
    return null
  }

  /* ── Go to step 2 ──────────────────────────────────────── */
  const handleNext = (e) => {
    e.preventDefault()
    setError('')
    const err = validateAccount()
    if (err) { setError(err); return }
    setStep(2)
  }

  /* ── Start verification (step 3) ────────────────────────── */
  const startVerification = () => {
    setVerifyStep('email')
    setEmailVerified(false)
    setPhoneVerified(false)
    setEmailCode('')
    setPhoneCode('')
    setVerifyError('')
    clearPendingVerification()

    const { code } = sendEmailCode(email.trim().toLowerCase())
    setEmailCodeGenerated(code)
    startTimer()
    setStep(3)
  }

  /* ── Resend code ────────────────────────────────────────── */
  const handleResendCode = () => {
    setVerifyError('')
    if (verifyStep === 'email') {
      const { code } = sendEmailCode(email.trim().toLowerCase())
      setEmailCodeGenerated(code)
      setEmailCode('')
    } else {
      const { code } = sendPhoneCode(phone.trim())
      setPhoneCodeGenerated(code)
      setPhoneCode('')
    }
    startTimer()
  }

  /* ── Verify email code ──────────────────────────────────── */
  const handleVerifyEmail = (e) => {
    e.preventDefault()
    setVerifyError('')
    if (!emailCode || emailCode.length !== 6) {
      setVerifyError('Please enter the 6-digit code sent to your email')
      return
    }
    if (!verifyEmailCode(emailCode)) {
      setVerifyError('Invalid or expired code. Please try again.')
      return
    }
    setEmailVerified(true)
    // Move to phone verification
    setVerifyStep('phone')
    setPhoneCode('')
    setVerifyError('')
    const { code } = sendPhoneCode(phone.trim())
    setPhoneCodeGenerated(code)
    startTimer()
  }

  /* ── Verify phone code ──────────────────────────────────── */
  const handleVerifyPhone = (e) => {
    e.preventDefault()
    setVerifyError('')
    if (!phoneCode || phoneCode.length !== 6) {
      setVerifyError('Please enter the 6-digit code sent to your phone')
      return
    }
    if (!verifyPhoneCode(phoneCode)) {
      setVerifyError('Invalid or expired code. Please try again.')
      return
    }
    setPhoneVerified(true)
    clearInterval(timerRef.current)
    // Both verified — complete registration
    completeRegistration()
  }

  /* ── Cancel verification ────────────────────────────────── */
  const handleCancelVerification = () => {
    clearPendingVerification()
    clearInterval(timerRef.current)
    setStep(2)
    setVerifyStep('email')
    setEmailCode('')
    setPhoneCode('')
    setEmailVerified(false)
    setPhoneVerified(false)
    setVerifyError('')
  }

  /* ── Step 2 submit — triggers verification ─────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isPaidPlan && stripe && !cardComplete) {
      setError('Please enter your payment card details')
      return
    }

    // Start the verification flow
    startVerification()
  }

  /* ── Actual registration after verification passes ──────── */
  const completeRegistration = async () => {
    setLoading(true)
    try {
      let authResponse
      try {
        authResponse = await authService.register({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          company: company.trim() || undefined,
          selectedPlan,
        })
      } catch (err) {
        if (err.status === 0 || err.message?.includes('Network error')) {
          console.warn('[Register] Backend unreachable — using offline mode')
          login({
            role: 'admin',
            user: {
              email: email.trim().toLowerCase(),
              fullName: fullName.trim(),
              companyName: company.trim() || fullName.trim(),
              phone: phone.trim(),
              agreementAcceptedAt: new Date().toISOString(),
              emailVerified: true,
              phoneVerified: true,
            },
          })
          setStoreAccountType(accountType)
          setPlan(selectedPlan)
          try {
            useAccountRegistry.getState().registerAccount({
              id: `reg-${Date.now()}`,
              company: company.trim() || fullName.trim(),
              email: email.trim().toLowerCase(),
              phone: phone.trim(),
              contactName: fullName.trim(),
              accountType,
              plan: selectedPlan,
              status: 'active',
              industries: [],
              categories: {},
              registeredAt: new Date().toISOString(),
              validUntil: selectedPlan === 'start' ? null : new Date(Date.now() + 365 * 86400000).toISOString(),
              agreementAcceptedAt: new Date().toISOString(),
              emailVerified: true,
              phoneVerified: true,
            })
          } catch { /* silent */ }
          analytics.track('user_register', { method: 'offline', plan: selectedPlan, accountType })
          navigate('/main-menu')
          return
        }
        throw err
      }

      // If paid plan, create Stripe subscription
      if (isPaidPlan && stripe && elements) {
        const cardElement = elements.getElement(CardElement)
        if (!cardElement) {
          setError('Card element not found. Please refresh and try again.')
          setLoading(false)
          return
        }

        const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            name: fullName.trim(),
            email: email.trim().toLowerCase(),
          },
        })

        if (pmError) {
          setError(pmError.message)
          setLoading(false)
          return
        }

        try {
          const subResult = await billingApi.createSubscription({
            plan_id: selectedPlan,
            payment_method_id: paymentMethod.id,
          })

          if (subResult.status === 'active' || subResult.status === 'trialing') {
            setPlan(selectedPlan, subResult.status)
            analytics.track('subscription_created_at_signup', {
              plan: selectedPlan,
              status: subResult.status,
            })
          } else if (subResult.client_secret) {
            const { error: confirmError } = await stripe.confirmCardPayment(subResult.client_secret)
            if (confirmError) {
              setError(`Payment requires confirmation: ${confirmError.message}`)
              setPlan('start')
            } else {
              setPlan(selectedPlan, 'active')
              analytics.track('subscription_created_at_signup', {
                plan: selectedPlan,
                status: 'active',
                required_3ds: true,
              })
            }
          }
        } catch (subErr) {
          console.warn('[Register] Subscription creation failed:', subErr.message)
          setPlan('start')
          setError(`Account created! Payment failed: ${subErr.detail || subErr.message}. You can upgrade from Plans page.`)
          setTimeout(() => navigate('/main-menu'), 3000)
          return
        }
      } else {
        setPlan(selectedPlan)
      }

      setStoreAccountType(accountType)

      try {
        useAccountRegistry.getState().registerAccount({
          id: `reg-${Date.now()}`,
          company: company.trim() || fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          contactName: fullName.trim(),
          accountType,
          plan: selectedPlan,
          status: 'active',
          industries: [],
          categories: {},
          registeredAt: new Date().toISOString(),
          validUntil: selectedPlan === 'start' ? null : new Date(Date.now() + 365 * 86400000).toISOString(),
          agreementAcceptedAt: new Date().toISOString(),
          emailVerified: true,
          phoneVerified: true,
        })
      } catch { /* silent */ }

      navigate('/main-menu')
    } catch (err) {
      setError(err.detail || err.message || 'Registration failed. Please try again.')
      setStep(2)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    if (!agreedToTerms) {
      setError('You must accept the Platform Agreement & NDA to continue')
      return
    }
    if (!authService.isGoogleSSOAvailable) {
      setError('Google SSO requires Firebase configuration.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authService.loginWithGoogle()
      setStoreAccountType(accountType)
      setPlan(accountType === 'buyer' ? 'basic' : 'start')
      try {
        useAccountRegistry.getState().registerAccount({
          id: `reg-${Date.now()}`,
          company: company.trim() || fullName.trim() || 'Google User',
          email: email.trim().toLowerCase() || '',
          phone: phone.trim() || '',
          contactName: fullName.trim() || '',
          accountType,
          plan: accountType === 'buyer' ? 'basic' : 'start',
          status: 'active',
          industries: [],
          categories: {},
          registeredAt: new Date().toISOString(),
          validUntil: null,
          agreementAcceptedAt: new Date().toISOString(),
        })
      } catch { /* silent */ }
      navigate('/main-menu')
    } catch (err) {
      setError(err.message || 'Google sign-up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-header">
        <div className="login-logo">
          <img src="/assets/strefex-logo.png" alt="STREFEX Logo" className="logo-image" />
        </div>
      </div>

      <div className="login-content" style={{ maxWidth: step === 2 ? 720 : 500 }}>
        <div className="login-card">
          <h1 className="login-title">Create Account</h1>
          <p className="login-subtitle">
            {step === 1
              ? 'Get started with STREFEX Platform'
              : step === 2
              ? `Choose your ${accountTypeLabel} plan`
              : 'Verify your identity'}
          </p>

          {/* Step indicator */}
          <div className="reg-steps">
            <div className={`reg-step ${step >= 1 ? 'active' : ''}`}>
              <span className="reg-step-num">1</span>
              <span className="reg-step-label">Account</span>
            </div>
            <div className="reg-step-line" />
            <div className={`reg-step ${step >= 2 ? 'active' : ''}`}>
              <span className="reg-step-num">2</span>
              <span className="reg-step-label">Plan & Payment</span>
            </div>
            <div className="reg-step-line" />
            <div className={`reg-step ${step >= 3 ? 'active' : ''}`}>
              <span className="reg-step-num">3</span>
              <span className="reg-step-label">Verify</span>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          {/* ── Step 1: Account Details ─────────────────── */}
          {step === 1 && (
            <form onSubmit={handleNext} className="login-form" noValidate>
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input type="text" id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required disabled={loading} />
              </div>
              <div className="form-group">
                <label htmlFor="reg-email">{t('login.email')}</label>
                <input type="email" id="reg-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required disabled={loading} />
              </div>
              <div className="form-group">
                <label htmlFor="reg-phone">Phone Number</label>
                <input
                  type="tel"
                  id="reg-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  required
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="company">Company (optional)</label>
                <input type="text" id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your Company" disabled={loading} />
              </div>
              <div className="form-group">
                <label>Account Type</label>
                <div className="reg-account-type-toggle reg-account-type-3col">
                  <button
                    type="button"
                    className={`reg-account-type-btn ${accountType === 'seller' ? 'active' : ''}`}
                    onClick={() => handleAccountTypeChange('seller')}
                    disabled={loading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M16 7V5a4 4 0 0 0-8 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <div>
                      <div className="reg-account-type-label">Seller</div>
                      <div className="reg-account-type-desc">Sell equipment & services</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`reg-account-type-btn ${accountType === 'buyer' ? 'active' : ''}`}
                    onClick={() => handleAccountTypeChange('buyer')}
                    disabled={loading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="9" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
                      <circle cx="20" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div>
                      <div className="reg-account-type-label">Buyer</div>
                      <div className="reg-account-type-desc">Source equipment & suppliers</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`reg-account-type-btn ${accountType === 'service_provider' ? 'active' : ''}`}
                    onClick={() => handleAccountTypeChange('service_provider')}
                    disabled={loading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div>
                      <div className="reg-account-type-label">Service Provider</div>
                      <div className="reg-account-type-desc">Provide services & maintenance</div>
                    </div>
                  </button>
                </div>
                {domainWarning && (
                  <div className="reg-domain-warning">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2"/></svg>
                    {domainWarning}
                  </div>
                )}
                <div className="reg-domain-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  One business domain can register as Seller <strong>and</strong> Buyer <strong>and</strong> Service Provider separately. Invite team members from within the platform.
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="reg-password">{t('login.password')}</label>
                <input type="password" id="reg-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 number" required disabled={loading} />
              </div>
              <div className="form-group">
                <label htmlFor="reg-confirm">Confirm Password</label>
                <input type="password" id="reg-confirm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required disabled={loading} />
              </div>

              {/* ── Platform Agreement & NDA ────────────── */}
              <div className="reg-agreement-section">
                <label className="reg-agreement-checkbox">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="reg-agreement-checkmark">
                    {agreedToTerms && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="reg-agreement-text">
                    I have read and agree to the{' '}
                    <button
                      type="button"
                      className="reg-agreement-link"
                      onClick={(e) => { e.stopPropagation(); setShowAgreementModal(true) }}
                    >
                      Platform Agreement &amp; NDA
                    </button>
                  </span>
                </label>
              </div>

              <button type="submit" className="login-button" disabled={loading || !agreedToTerms}>
                Next — Choose Plan
              </button>

              {authService.isGoogleSSOAvailable && (
                <>
                  <div className="login-divider"><span>or</span></div>
                  <button type="button" className="login-button login-button-google" onClick={handleGoogleSignup} disabled={loading || !agreedToTerms}>
                    <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: 8, flexShrink: 0 }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Sign up with Google
                  </button>
                </>
              )}
            </form>
          )}

          {/* ── Step 2: Plan Selection + Payment ────────── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="reg-account-type-indicator">
                Registering as <strong>{accountTypeLabel}</strong>
                <button
                  type="button"
                  className="reg-change-type-link"
                  onClick={() => { setStep(1); setError('') }}
                >
                  Change
                </button>
              </div>

              <div className="reg-plans" style={{ gridTemplateColumns: `repeat(${availablePlans.length}, 1fr)` }}>
                {availablePlans.map((plan) => {
                  const price = getPlanPrice(plan, accountType)
                  const features = getPlanFeatures(plan, accountType)
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      className={`reg-plan-card ${selectedPlan === plan.id ? 'selected' : ''} ${plan.popular ? 'popular' : ''}`}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      {plan.popular && <span className="reg-plan-badge">Popular</span>}
                      <span className="reg-plan-name">{plan.name}</span>
                      <span className="reg-plan-price">
                        {price === 0 ? 'Free' : `$${price}/mo`}
                      </span>
                      <ul className="reg-plan-features">
                        {features.slice(0, 3).map((f, i) => (
                          <li key={i}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#2e7d32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            {f}
                          </li>
                        ))}
                        {features.length > 3 && (
                          <li className="reg-plan-more">+{features.length - 3} more</li>
                        )}
                      </ul>
                    </button>
                  )
                })}
              </div>

              {isPaidPlan && stripe && (
                <div className="reg-payment-section">
                  <div className="reg-payment-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="5" width="20" height="14" rx="2" stroke="#000888" strokeWidth="2"/>
                      <path d="M2 10h20" stroke="#000888" strokeWidth="2"/>
                    </svg>
                    <span>Payment Details</span>
                    <span className="reg-payment-amount">${displayPrice}/month</span>
                  </div>
                  <div className="reg-card-element">
                    <CardElement
                      options={CARD_ELEMENT_OPTIONS}
                      onChange={(e) => setCardComplete(e.complete)}
                    />
                  </div>
                  <div className="reg-payment-note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#2e7d32" strokeWidth="2"/></svg>
                    Secured by Stripe. You can cancel or change plans anytime.
                  </div>
                </div>
              )}

              {isPaidPlan && !stripe && (
                <div className="reg-free-note" style={{ borderColor: '#f0c040', background: '#fffbeb' }}>
                  Payment processing is not available yet. Your account will be created on the free plan — you can upgrade anytime from the Plans page.
                </div>
              )}

              {!isPaidPlan && (
                <div className="reg-free-note">
                  No payment required for the Start plan. You can upgrade anytime from the Plans page.
                </div>
              )}

              <div className="reg-form-actions">
                <button
                  type="button"
                  className="login-button login-button-google"
                  onClick={() => { setStep(1); setError('') }}
                  disabled={loading}
                  style={{ flex: '0 0 auto', width: 'auto', padding: '14px 24px' }}
                >
                  Back
                </button>
                <button type="submit" className="login-button" disabled={loading || (isPaidPlan && stripe && !cardComplete)} style={{ flex: 1 }}>
                  {loading
                    ? 'Processing...'
                    : 'Next — Verify Identity'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Verification (shown inline, not as modal) ── */}
          {step === 3 && (
            <div className="login-2fa-form">
              {/* Sub-steps: email → phone */}
              <div className="login-2fa-steps">
                <div className={`login-2fa-step ${emailVerified ? 'done' : verifyStep === 'email' ? 'active' : ''}`}>
                  <span className="login-2fa-step-num">
                    {emailVerified ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : '1'}
                  </span>
                  <span>Email</span>
                </div>
                <div className={`login-2fa-step-connector ${emailVerified ? 'done' : ''}`} />
                <div className={`login-2fa-step ${phoneVerified ? 'done' : verifyStep === 'phone' ? 'active' : ''}`}>
                  <span className="login-2fa-step-num">
                    {phoneVerified ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : '2'}
                  </span>
                  <span>Phone</span>
                </div>
              </div>

              {/* ── Email verification ──────────────────── */}
              {verifyStep === 'email' && !emailVerified && (
                <form onSubmit={handleVerifyEmail}>
                  <div className="login-2fa-header" style={{ marginBottom: 16 }}>
                    <div className="login-2fa-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="4" width="20" height="16" rx="2" stroke="#000888" strokeWidth="2"/>
                        <path d="M22 7l-10 7L2 7" stroke="#000888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h2 className="login-2fa-title">Verify Your Email</h2>
                    <p className="login-2fa-subtitle">
                      Enter the 6-digit verification code below for<br/>
                      <strong>{email}</strong>
                    </p>
                  </div>

                  {verifyError && (
                    <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      {verifyError}
                    </div>
                  )}

                  <div className="login-2fa-code-wrap">
                    <input
                      type="text"
                      className="login-2fa-input"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      autoComplete="one-time-code"
                    />
                    <span className={`login-2fa-timer ${verifyTimer < 60 ? 'login-2fa-timer-warn' : ''}`}>
                      {formatTimer(verifyTimer)}
                    </span>
                  </div>

                  <div className="login-2fa-demo-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span>
                      Your verification code: <strong className="login-2fa-demo-code">{emailCodeGenerated}</strong>
                    </span>
                  </div>

                  <div className="login-2fa-resend">
                    <button
                      type="button"
                      className="login-2fa-resend-btn"
                      onClick={handleResendCode}
                      disabled={verifyTimer > 240}
                    >
                      Resend code
                    </button>
                  </div>

                  <div className="login-2fa-actions">
                    <button type="button" className="login-2fa-btn-cancel" onClick={handleCancelVerification}>
                      Back
                    </button>
                    <button
                      type="submit"
                      className="login-2fa-btn-verify"
                      disabled={emailCode.length !== 6 || verifyTimer === 0}
                    >
                      Verify Email
                    </button>
                  </div>
                </form>
              )}

              {/* ── Phone verification ──────────────────── */}
              {verifyStep === 'phone' && !phoneVerified && (
                <form onSubmit={handleVerifyPhone}>
                  <div className="login-2fa-header" style={{ marginBottom: 16 }}>
                    <div className="login-2fa-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <rect x="5" y="2" width="14" height="20" rx="2" stroke="#000888" strokeWidth="2"/>
                        <line x1="12" y1="18" x2="12.01" y2="18" stroke="#000888" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <h2 className="login-2fa-title">Verify Your Phone</h2>
                    <p className="login-2fa-subtitle">
                      Enter the 6-digit verification code below for<br/>
                      <strong>{phone}</strong>
                    </p>
                  </div>

                  {verifyError && (
                    <div className="login-error" role="alert" style={{ marginBottom: 14 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      {verifyError}
                    </div>
                  )}

                  <div className="login-2fa-code-wrap">
                    <input
                      type="text"
                      className="login-2fa-input"
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      autoComplete="one-time-code"
                    />
                    <span className={`login-2fa-timer ${verifyTimer < 60 ? 'login-2fa-timer-warn' : ''}`}>
                      {formatTimer(verifyTimer)}
                    </span>
                  </div>

                  <div className="login-2fa-demo-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span>
                      Your verification code: <strong className="login-2fa-demo-code">{phoneCodeGenerated}</strong>
                    </span>
                  </div>

                  <div className="login-2fa-resend">
                    <button
                      type="button"
                      className="login-2fa-resend-btn"
                      onClick={handleResendCode}
                      disabled={verifyTimer > 240}
                    >
                      Resend code
                    </button>
                  </div>

                  <div className="login-2fa-actions">
                    <button type="button" className="login-2fa-btn-cancel" onClick={handleCancelVerification}>
                      Back
                    </button>
                    <button
                      type="submit"
                      className="login-2fa-btn-verify"
                      disabled={phoneCode.length !== 6 || verifyTimer === 0 || loading}
                    >
                      {loading ? 'Creating account...' : 'Verify & Create Account'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#666' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#000888', fontWeight: 500, textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>

      </div>

      {/* ── Platform Agreement & NDA Modal ───────────────── */}
      {showAgreementModal && (
        <div className="reg-agreement-overlay" onClick={() => setShowAgreementModal(false)}>
          <div className="reg-agreement-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reg-agreement-modal-header">
              <h2>STREFEX Platform Agreement &amp; NDA</h2>
              <button type="button" className="reg-agreement-close" onClick={() => setShowAgreementModal(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="reg-agreement-modal-body">
              <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Last updated: February 2026</p>

              <h3>1. General Terms</h3>
              <p>
                By registering an account on the STREFEX Platform ("Platform"), you ("User") agree to the terms and conditions
                outlined in this Platform Agreement &amp; Non-Disclosure Agreement ("Agreement"). This Agreement constitutes a
                legally binding contract between the User and STREFEX ("Company").
              </p>

              <h3>2. Account Information &amp; Data Usage</h3>
              <p>
                The User hereby grants STREFEX the right to collect, store, process, and use the account information provided
                during registration and platform usage, including but not limited to:
              </p>
              <ul>
                <li>Company name, address, and contact details</li>
                <li>Contact person name, email, and phone number</li>
                <li>Industry affiliations and service/product categories</li>
                <li>Certifications, capabilities, and company descriptions</li>
                <li>Submitted requests, quotes, and communication records</li>
              </ul>
              <p>
                This information may be shared with registered Buyers, Sellers, and Service Providers on the Platform for
                the purpose of facilitating business connections, supplier selection, quote requests, audits, and related
                commercial activities.
              </p>

              <h3>3. Purpose of Data Sharing</h3>
              <p>STREFEX may use and share User account information for the following purposes:</p>
              <ul>
                <li>Presenting supplier profiles and capabilities to potential Buyers</li>
                <li>Facilitating Request for Quote (RFQ) and supplier selection processes</li>
                <li>Enabling audit requests, service requests, and project management activities</li>
                <li>Providing Executive Summaries and market analysis to authorized users</li>
                <li>Compliance with legal obligations and regulatory requirements</li>
                <li>Improving Platform services and user experience</li>
              </ul>

              <h3>4. Non-Disclosure Agreement (NDA)</h3>
              <p>
                All parties registered on the Platform agree to treat any confidential information shared through the Platform
                with the same degree of care as their own confidential information. Confidential information includes, but is
                not limited to:
              </p>
              <ul>
                <li>Pricing information, cost breakdowns, and financial data</li>
                <li>Technical specifications, drawings, and manufacturing processes</li>
                <li>Business strategies, client lists, and proprietary methods</li>
                <li>Any information explicitly marked as confidential</li>
              </ul>
              <p>
                Users agree not to disclose, reproduce, or use confidential information obtained through the Platform for any
                purpose other than the specific business transaction for which it was shared, unless expressly authorized in
                writing by the information owner.
              </p>

              <h3>5. Intellectual Property</h3>
              <p>
                All content, trademarks, and intellectual property displayed on the Platform remain the property of their
                respective owners. The User retains ownership of all information and materials they submit. STREFEX is granted
                a non-exclusive license to display and process such materials solely for the operation of the Platform.
              </p>

              <h3>6. Limitation of Liability</h3>
              <p>
                STREFEX provides the Platform on an "as-is" basis. While we strive to ensure accuracy and security, STREFEX
                shall not be liable for any indirect, incidental, or consequential damages arising from the use of the Platform,
                including but not limited to data loss, business interruption, or unauthorized access by third parties.
              </p>

              <h3>7. Account Termination</h3>
              <p>
                STREFEX reserves the right to suspend or terminate any account that violates this Agreement. Upon termination,
                the User's data will be retained for a period required by applicable law and then securely deleted, unless
                the User requests earlier deletion in compliance with data protection regulations.
              </p>

              <h3>8. Data Protection &amp; Privacy</h3>
              <p>
                STREFEX complies with applicable data protection laws including GDPR. Users have the right to access, correct,
                or request deletion of their personal data. For data protection inquiries, contact the STREFEX Data Protection
                Officer at <strong>privacy@strefex.com</strong>.
              </p>

              <h3>9. Amendments</h3>
              <p>
                STREFEX reserves the right to modify this Agreement at any time. Users will be notified of material changes
                and may be required to re-accept the updated terms to continue using the Platform.
              </p>

              <h3>10. Governing Law</h3>
              <p>
                This Agreement shall be governed by and construed in accordance with the laws of the jurisdiction in which
                STREFEX is incorporated, without regard to conflict of law provisions.
              </p>
            </div>

            <div className="reg-agreement-modal-footer">
              <button
                type="button"
                className="reg-agreement-decline-btn"
                onClick={() => setShowAgreementModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="reg-agreement-accept-btn"
                onClick={() => { setAgreedToTerms(true); setShowAgreementModal(false) }}
              >
                I Accept &amp; Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Wrapper with Stripe Elements provider ───────────────── */
export default function Register() {
  const stripePromise = isStripeConfigured ? getStripe() : null

  return (
    <Elements stripe={stripePromise}>
      <RegisterForm />
    </Elements>
  )
}
