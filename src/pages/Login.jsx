import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useAccountRegistry } from '../store/accountRegistry'
import { useTranslation } from '../i18n/useTranslation'
import authService from '../services/authService'
import {
  isSuperadminEmail,
  validateSuperadminCredentials,
  generate2FACode,
  verify2FACode,
  clear2FA,
} from '../services/superadminAuth'
import { analytics } from '../services/analytics'
import './Login.css'

const PREVIEW_ENABLED = import.meta.env.VITE_PREVIEW_LOGIN_ENABLED === 'true'
const PREVIEW_EMAIL = 'preview@strefex.com'
const PREVIEW_SESSION_MINUTES = 10

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 2FA state for superadmin login
  const [show2FA, setShow2FA] = useState(false)
  const [twoFACode, setTwoFACode] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFATimer, setTwoFATimer] = useState(300)
  const timerRef = useRef(null)

  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const setPlan = useSubscriptionStore((s) => s.setPlan)
  const setAccountType = useSubscriptionStore((s) => s.setAccountType)
  const theme = useSettingsStore((s) => s.theme)
  const { t } = useTranslation()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (isAuthenticated) navigate('/main-menu', { replace: true })
  }, [isAuthenticated, navigate])

  // Countdown timer for 2FA code expiry
  useEffect(() => {
    if (!show2FA) return
    setTwoFATimer(300)
    timerRef.current = setInterval(() => {
      setTwoFATimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setTwoFAError('Code expired. Please try again.')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [show2FA])

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  /* ── Main login handler ──────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }
    if (!password || password.length < 3) {
      setError('Password must be at least 3 characters')
      return
    }

    const trimmedEmail = email.trim().toLowerCase()

    // ── Superadmin login path — requires 2FA ──
    if (isSuperadminEmail(trimmedEmail)) {
      if (!validateSuperadminCredentials(trimmedEmail, password)) {
        setError('Invalid credentials')
        return
      }
      // Credentials valid — send 2FA code
      const code = generate2FACode()
      setGeneratedCode(code)
      setTwoFACode('')
      setTwoFAError('')
      setShow2FA(true)
      return
    }

    // ── Regular login path ──
    setLoading(true)
    try {
      await authService.loginWithEmail(email, password)
      navigate('/main-menu')
    } catch (err) {
      if (err.status === 0 || err.message?.includes('Network error')) {
        console.warn('[Login] Backend unreachable — using offline mode')

        const registry = useAccountRegistry.getState().accounts
        let role = 'user'
        const matchAccount = registry.find((a) => a.email?.toLowerCase() === trimmedEmail)
        if (matchAccount) {
          role = 'admin'
        } else {
          const asMember = registry.find((a) =>
            a.teamMembers?.some((m) => m.email?.toLowerCase() === trimmedEmail)
          )
          if (asMember) {
            const member = asMember.teamMembers.find((m) => m.email?.toLowerCase() === trimmedEmail)
            role = member?.role || 'user'
          }
        }
        // superadmin is NEVER assigned via regular login
        if (role === 'superadmin') role = 'admin'

        login({
          role,
          user: {
            email: trimmedEmail,
            fullName: matchAccount?.contactName || email.split('@')[0] || 'User',
            companyName: matchAccount?.company || email.split('@')[1]?.split('.')[0] || 'Company',
          },
        })
        analytics.track('user_login', { method: 'offline', role })
        navigate('/main-menu')
      } else {
        setError(err.detail || err.message || 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  /* ── 2FA verification for superadmin ─────────────────────── */
  const handle2FASubmit = (e) => {
    e.preventDefault()
    setTwoFAError('')

    if (!twoFACode || twoFACode.length !== 6) {
      setTwoFAError('Please enter the 6-digit confirmation code')
      return
    }

    if (!verify2FACode(twoFACode)) {
      setTwoFAError('Invalid or expired code. Please try again.')
      return
    }

    // 2FA verified — complete superadmin login
    clearInterval(timerRef.current)
    login({
      role: 'superadmin',
      user: {
        email: email.trim().toLowerCase(),
        fullName: 'STREFEX Admin',
        companyName: 'STREFEX',
      },
      tenant: {
        id: 'strefex-platform',
        name: 'STREFEX',
        slug: 'strefex',
      },
    })
    setPlan('enterprise', 'active')
    setAccountType('buyer')
    analytics.track('user_login', { method: 'superadmin_2fa', role: 'superadmin' })
    setShow2FA(false)
    navigate('/main-menu')
  }

  const handleCancel2FA = () => {
    clear2FA()
    clearInterval(timerRef.current)
    setShow2FA(false)
    setTwoFACode('')
    setGeneratedCode('')
    setTwoFAError('')
  }

  /* ── Preview login — limited session, read-only ──────────── */
  const handlePreviewLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await authService.loginWithEmail(PREVIEW_EMAIL, 'preview123')
      localStorage.setItem('strefex-preview-expires', String(Date.now() + PREVIEW_SESSION_MINUTES * 60 * 1000))
      navigate('/main-menu')
    } catch (err) {
      if (err.status === 0 || err.message?.includes('Network error')) {
        const expiresAt = Date.now() + PREVIEW_SESSION_MINUTES * 60 * 1000
        localStorage.setItem('strefex-preview-expires', String(expiresAt))

        login({
          role: 'admin',
          user: {
            email: PREVIEW_EMAIL,
            fullName: 'Preview User',
            companyName: 'STREFEX Demo',
          },
        })
        setPlan('enterprise', 'active')
        setAccountType('buyer')
        analytics.track('user_login', { method: 'preview', role: 'admin' })
        navigate('/main-menu')
      } else {
        setError(err.detail || err.message || 'Login failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    if (!authService.isGoogleSSOAvailable) {
      setError('Google SSO requires Firebase configuration.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authService.loginWithGoogle()
      navigate('/main-menu')
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
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

      <div className="login-content">
        <div className="login-card">
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">{t('login.signIn')} — STREFEX Platform</p>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            {error && (
              <div className="login-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="email">{t('login.email')}</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.email')}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">{t('login.password')}</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.password')}
                required
                disabled={loading}
              />
            </div>

            <div className="form-options">
              <label className="checkbox-label">
                <input type="checkbox" />
                <span>{t('login.rememberMe')}</span>
              </label>
              <a href="#" className="forgot-password">{t('login.forgotPassword')}</a>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Signing in...' : t('login.signIn')}
            </button>

            {authService.isGoogleSSOAvailable && (
              <>
                <div className="login-divider">
                  <span>or</span>
                </div>
                <button
                  type="button"
                  className="login-button login-button-google"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: 8, flexShrink: 0 }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Continue with Google
                </button>
              </>
            )}
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#666' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#000888', fontWeight: 500, textDecoration: 'none' }}>
              Sign Up
            </Link>
          </div>

          {PREVIEW_ENABLED && (
          <div className="login-superadmin-access">
            <button
              type="button"
              className="login-superadmin-btn"
              onClick={handlePreviewLogin}
              disabled={loading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Preview Platform
            </button>
            <span className="login-superadmin-hint">{PREVIEW_SESSION_MINUTES}-min session — all features visible, supplier names hidden</span>
          </div>
          )}
        </div>
      </div>

      {/* ── 2FA Verification Modal for Superadmin ─────────── */}
      {show2FA && (
        <div className="login-2fa-overlay" onClick={handleCancel2FA}>
          <div className="login-2fa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="login-2fa-header">
              <div className="login-2fa-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#000888" strokeWidth="2"/>
                  <path d="M9 12l2 2 4-4" stroke="#000888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="login-2fa-title">Two-Factor Authentication</h2>
              <p className="login-2fa-subtitle">
                Enter the 6-digit confirmation code below for<br/>
                <strong>{email}</strong>
              </p>
            </div>

            <form onSubmit={handle2FASubmit} className="login-2fa-form">
              {twoFAError && (
                <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  {twoFAError}
                </div>
              )}

              <div className="login-2fa-code-wrap">
                <input
                  type="text"
                  className="login-2fa-input"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                />
                <span className={`login-2fa-timer ${twoFATimer < 60 ? 'login-2fa-timer-warn' : ''}`}>
                  {formatTimer(twoFATimer)}
                </span>
              </div>

              <div className="login-2fa-demo-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>
                  Your confirmation code: <strong className="login-2fa-demo-code">{generatedCode}</strong>
                </span>
              </div>

              <div className="login-2fa-actions">
                <button type="button" className="login-2fa-btn-cancel" onClick={handleCancel2FA}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="login-2fa-btn-verify"
                  disabled={twoFACode.length !== 6 || twoFATimer === 0}
                >
                  Verify & Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
