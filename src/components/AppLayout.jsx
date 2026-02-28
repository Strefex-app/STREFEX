import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useTranslation } from '../i18n/useTranslation'
import Icon from './Icon'
import './AppLayout.css'

/*
 * Sidebar items with optional gating:
 *   minRole      — RBAC role requirement (unchanged)
 *   requiredPlan — subscription feature flag key from plan.limits
 *                  Items with requiredPlan are hidden if the feature is false.
 *
 * Order: common items first, then admin, then utility at the bottom.
 * Management modules (Project, Production, Enterprise, Cost) are grouped
 * under a single "Management" item that links to the /management hub page.
 * The hub page shows all modules — locked ones display an upgrade prompt.
 */
const SIDEBAR_NAV = [
  { id: 'home', tKey: 'nav.home', path: '/main-menu', icon: 'home' },
  { id: 'profile', tKey: 'nav.profile', path: '/profile', icon: 'profile' },
  { id: 'management', tKey: 'nav.management', path: '/management', icon: 'management' },
  { id: 'service-requests', tKey: 'nav.serviceRequests', path: '/service-requests', icon: 'service-requests', minRole: 'manager' },
  { id: 'messenger', tKey: 'nav.messenger', path: '/messenger', icon: 'messenger', requiredPlan: 'messenger' },
  { id: 'notifications', tKey: 'nav.notifications', path: '/notifications', icon: 'notifications' },
  { id: 'support', tKey: 'nav.support', path: '/support', icon: 'support' },
  { id: 'procurement', label: 'Procurement', path: '/procurement', icon: 'procurement', requiredPlan: 'procurement' },
  { id: 'vendors', label: 'Vendor Master', path: '/vendors', icon: 'vendors' },
  { id: 'contracts', label: 'Contracts', path: '/contracts', icon: 'contracts', requiredPlan: 'contractManagement' },
  { id: 'spend', label: 'Spend Analysis', path: '/spend-analysis', icon: 'spend', requiredPlan: 'spendAnalysis' },
  { id: 'compliance', label: 'Compliance & ESG', path: '/compliance', icon: 'compliance', requiredPlan: 'complianceEsg' },
  { id: 'ai-insights', label: 'AI Insights', path: '/ai-insights', icon: 'ai', requiredPlan: 'aiInsights' },
  { id: 'templates', label: 'Templates', path: '/templates', icon: 'templates', requiredPlan: 'templateLibrary' },
  { id: 'erp', label: 'ERP Integrations', path: '/erp-integrations', icon: 'erp', requiredPlan: 'erpIntegrations' },
  { id: 'audit-logs', label: 'Audit Logs', path: '/audit-logs', icon: 'audit', minRole: 'admin', requiredPlan: 'auditLogs' },
  { id: 'wallet', label: 'Wallet', path: '/wallet', icon: 'wallet' },
  { id: 'payment', tKey: 'nav.payment', path: '/payment', icon: 'card' },
  { id: 'plans', tKey: 'nav.plans', path: '/plans', icon: 'plan' },
  { id: 'settings', tKey: 'nav.settings', path: '/settings', icon: 'settings' },
  { id: 'admin-dashboard', tKey: 'nav.adminDashboard', path: '/admin-dashboard', icon: 'admin-dashboard', minRole: 'superadmin', hideInPreview: true },
  { id: 'developer', tKey: 'nav.developer', path: '/developer', icon: 'developer', minRole: 'superadmin', hideInPreview: true },
]

/* getNavIcon — uses centralised Icon component */
const getNavIcon = (iconName) => <Icon name={iconName} size={24} />

export default function AppLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((state) => state.logout)
  const role = useAuthStore((state) => state.role)
  const hasRole = useAuthStore((state) => state.hasRole)
  const user = useAuthStore((state) => state.user)
  const theme = useSettingsStore((s) => s.theme)
  const { t } = useTranslation()

  const hasFeature = useSubscriptionStore((s) => s.hasFeature)
  const currentPlanId = useSubscriptionStore((s) => s.planId)
  const accountType = useSubscriptionStore((s) => s.accountType)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [previewTimeLeft, setPreviewTimeLeft] = useState(null) // seconds remaining

  /* Keep data-theme in sync on every render */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  /* Close mobile drawer on navigation */
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  /* ── Preview session countdown (10-min) ─────────────────── */
  useEffect(() => {
    const expiresRaw = localStorage.getItem('strefex-preview-expires')
    if (!expiresRaw) { setPreviewTimeLeft(null); return }
    const expiresAt = Number(expiresRaw)
    if (isNaN(expiresAt)) { setPreviewTimeLeft(null); return }

    const tick = () => {
      const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
      if (remaining <= 0) {
        // Session expired — clean up and log out
        localStorage.removeItem('strefex-preview-expires')
        setPreviewTimeLeft(null)
        logout()
        navigate('/login')
        return
      }
      setPreviewTimeLeft(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [logout, navigate])

  const handleLogout = () => {
    localStorage.removeItem('strefex-preview-expires')
    logout()
    navigate('/login')
  }

  const displayName = user?.fullName || user?.name || user?.email || 'User'
  const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  const roleLabels = { superadmin: 'Super Admin', auditor_external: 'Auditor (External)', admin: 'Admin', auditor_internal: 'Auditor (Internal)', manager: 'Manager', user: 'User' }
  const roleLabel = roleLabels[role] || 'User'

  return (
    <div className="app-layout">
      {/* Mobile hamburger */}
      <button
        type="button"
        className="mobile-menu-btn"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Icon name="menu" size={24} />
      </button>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/assets/strefex-logo.png" alt="STREFEX" className="sidebar-logo-img" />
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {SIDEBAR_NAV
            .filter((item) => !item.minRole || hasRole(item.minRole))
            .filter((item) => !item.requiredPlan || hasFeature(item.requiredPlan))
            .filter((item) => !item.hideInPreview || previewTimeLeft === null)
            .map((item) => {
              const isActive = location.pathname === item.path ||
                (item.id === 'management' && (
                  location.pathname.startsWith('/management') ||
                  location.pathname.startsWith('/team') ||
                  location.pathname.startsWith('/project-management') ||
                  location.pathname.startsWith('/production') ||
                  location.pathname.startsWith('/cost-management') ||
                  location.pathname.startsWith('/enterprise')
                )) ||
                (item.id === 'wallet' && (
                  location.pathname.startsWith('/wallet') ||
                  location.pathname.startsWith('/send-payment')
                )) ||
                (item.id === 'vendors' && location.pathname.startsWith('/vendors')) ||
                (item.id === 'procurement' && location.pathname.startsWith('/procurement')) ||
                (item.id === 'contracts' && location.pathname.startsWith('/contracts')) ||
                (item.id === 'spend' && location.pathname.startsWith('/spend')) ||
                (item.id === 'compliance' && location.pathname.startsWith('/compliance')) ||
                (item.id === 'templates' && location.pathname.startsWith('/templates')) ||
                (item.id === 'audit-logs' && location.pathname.startsWith('/audit-logs'))
              return (
                <button
                  key={item.id}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <span className="sidebar-nav-icon">{getNavIcon(item.icon)}</span>
                  <span className="sidebar-nav-label">{item.tKey ? t(item.tKey) : item.label}</span>
                </button>
              )
            })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-profile" onClick={() => navigate('/profile')}>
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-profile-info">
              <span className="sidebar-profile-name">{user?.name || 'User'}</span>
              <span className="sidebar-profile-role">
                {roleLabel}
                <span
                  className="sidebar-plan-badge"
                  onClick={(e) => { e.stopPropagation(); navigate('/plans') }}
                  title="Click to manage subscription"
                >
                  {accountType === 'buyer' ? 'B' : accountType === 'service_provider' ? 'SP' : 'S'} · {currentPlanId === 'start' ? 'Free' : currentPlanId.charAt(0).toUpperCase() + currentPlanId.slice(1)}
                </span>
              </span>
            </div>
          </div>
          <button type="button" className="sidebar-logout" onClick={handleLogout}>
            <Icon name="logout" size={20} />
            <span className="sidebar-logout-label">{t('nav.logout')}</span>
          </button>
        </div>
      </aside>
      <main className="app-main">
        {/* Preview session countdown banner */}
        {previewTimeLeft !== null && previewTimeLeft > 0 && (
          <div className={`preview-timer-banner ${previewTimeLeft <= 60 ? 'preview-timer-urgent' : ''}`}>
            <Icon name="clock" size={16} />
            <span>
              Preview session — <strong>{Math.floor(previewTimeLeft / 60)}:{(previewTimeLeft % 60).toString().padStart(2, '0')}</strong> remaining
            </span>
            <span className="preview-timer-note">Supplier names are hidden</span>
            <button
              type="button"
              className="preview-timer-register-btn"
              onClick={() => { localStorage.removeItem('strefex-preview-expires'); logout(); navigate('/register') }}
            >
              Register Now
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
