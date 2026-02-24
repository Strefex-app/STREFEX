import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useTranslation } from '../i18n/useTranslation'
import authService from '../services/authService'
import {
  isSuperadminEmail,
  validateSuperadminCredentials,
} from '../services/superadminAuth'
import { analytics } from '../services/analytics'
import './Login.css'

const PREVIEW_ENABLED = import.meta.env.VITE_PREVIEW_LOGIN_ENABLED === 'true'
const PREVIEW_EMAIL = 'preview@strefex.com'
const PREVIEW_SESSION_MINUTES = 10

function getReadableErrorMessage(err, fallback) {
  if (!err) return fallback
  if (typeof err === 'string' && err.trim()) return err

  const detail = typeof err?.detail === 'string' ? err.detail.trim() : ''
  if (detail && detail !== '{}') return detail

  const message = typeof err?.message === 'string' ? err.message.trim() : ''
  if (message && message !== '{}') return message

  const errorDescription = typeof err?.error_description === 'string' ? err.error_description.trim() : ''
  if (errorDescription && errorDescription !== '{}') return errorDescription

  return fallback
}

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const [searchParams] = useSearchParams()
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

  useEffect(() => {
    if (searchParams.get('confirmed') === 'true') {
      setInfo('Email confirmed! You can now sign in.')
    }
  }, [searchParams])

  /* ── Main login handler ──────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }
    if (!password || password.length < 3) {
      setError('Password must be at least 3 characters')
      return
    }

    const trimmedEmail = email.trim().toLowerCase()

    // ── Superadmin login — client-side credential check, no 2FA ──
    if (isSuperadminEmail(trimmedEmail)) {
      if (!validateSuperadminCredentials(trimmedEmail, password)) {
        setError('Invalid credentials')
        return
      }
      login({
        role: 'superadmin',
        user: {
          email: trimmedEmail,
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
      analytics.track('user_login', { method: 'superadmin', role: 'superadmin' })
      navigate('/main-menu')
      return
    }

    // ── Regular login via Supabase / backend ──
    setLoading(true)
    try {
      await authService.loginWithEmail(email, password)
      navigate('/main-menu')
    } catch (err) {
      const msg = getReadableErrorMessage(err, '')

      if (err.code === 'email_not_confirmed' || msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('verify your email')) {
        setError('Please verify your email before logging in.')
      } else if (err.code === 'invalid_credentials' || msg.toLowerCase().includes('invalid login')) {
        setError('Invalid email or password.')
      } else if (err.status === 0 || msg.includes('Network error') || msg.includes('Failed to fetch')) {
        setError('Unable to reach the server. Please check your internet connection and try again.')
      } else {
        setError(getReadableErrorMessage(err, 'Login failed. Please try again.'))
      }
    } finally {
      setLoading(false)
    }
  }

  /* ── Preview login — limited session, read-only ──────────── */
  const handlePreviewLogin = async () => {
    setError('')
    setInfo('')
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
    setInfo('')
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
            {info && (
              <div className="login-info" role="status" style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
                borderRadius: 8, background: '#e8f5e9', color: '#2e7d32', fontSize: 14,
                marginBottom: 16, border: '1px solid #c8e6c9'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {info}
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
    </div>
  )
}

export default Login
