import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useTranslation } from '../i18n/useTranslation'
import authService from '../services/authService'
import './Login.css'

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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
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

            <div className="login-divider">
              <span>Professional accounts only</span>
            </div>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#666' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#000888', fontWeight: 500, textDecoration: 'none' }}>
              Sign Up
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Login
