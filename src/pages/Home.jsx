import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../store/projectStore'
import useRfqStore from '../store/rfqStore'
import { useServiceRequestStore } from '../store/serviceRequestStore'
import { useAuthStore } from '../store/authStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useTranslation } from '../i18n/useTranslation'
import AppLayout from '../components/AppLayout'
import Icon from '../components/Icon'
import './Home.css'

const QUICK_ACTIONS = [
  {
    id: 'supplier',
    tKey: 'home.supplierSelection',
    icon: 'document',
    expandable: true,
    children: [
      { id: 'supplier-product', label: 'Product & Component', path: '/product-hub', color: '#2e7d32' },
      { id: 'supplier-equipment', label: 'Equipment', path: '/equipment-request', color: '#000888' },
      { id: 'supplier-service', label: 'Service', path: '/service-hub', color: '#e65100' },
    ],
  },
  {
    id: 'service',
    tKey: 'home.service',
    icon: 'refresh',
    expandable: true,
    children: [
      { id: 'svc-project', label: 'Project Management', path: '/services?context=service&serviceCategory=project-management&serviceCategoryLabel=Project+Management', color: '#000888' },
      { id: 'svc-supplier', label: 'Supplier Services', path: '/services?context=service&serviceCategory=supplier-services&serviceCategoryLabel=Supplier+Services', color: '#e65100' },
      { id: 'svc-quality', label: 'Quality & Compliance', path: '/services?context=service&serviceCategory=quality-services&serviceCategoryLabel=Quality+%26+Compliance', color: '#2e7d32' },
    ],
  },
  { id: 'audit', tKey: 'home.audit', path: '/audit-request', icon: 'monitor' },
  { id: 'project-mgmt', tKey: 'home.projectManagement', path: '/project-management', icon: 'gantt' },
  { id: 'vendors', label: 'Vendor Master', path: '/vendors', icon: 'vendors' },
  { id: 'wallet', label: 'Wallet & Payments', path: '/wallet', icon: 'wallet' },
]

const getQuickActionIcon = (iconName) => <Icon name={iconName} size={20} />

export default function Home() {
  const navigate = useNavigate()
  const projects = useProjectStore((state) => state.projects)
  const hasRole = useAuthStore((state) => state.hasRole)
  const accountType = useSubscriptionStore((s) => s.accountType)
  const rfqStats = useRfqStore((s) => s.getRfqStats)()
  const receivedRfqStats = useRfqStore((s) => s.getReceivedRfqStats)()
  const serviceRequestStats = useServiceRequestStore((s) => s.getStats)()
  const [expandedAction, setExpandedAction] = useState(null)

  const { t } = useTranslation()

  const role = useAuthStore((s) => s.role)
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = role === 'superadmin'
  const accountTypes = Array.isArray(user?.accountTypes) && user.accountTypes.length > 0
    ? user.accountTypes
    : [accountType || 'seller']
  const hasAccountType = (type) => accountTypes.includes(type)
  const isSeller = hasAccountType('seller')
  const isServiceProvider = hasAccountType('service_provider')

  const projectsTotal = projects?.length ?? 0
  const projectsInProgress = projects?.reduce((acc, p) => {
    const inProgress = (p.tasks || []).filter(task => task.status === 'in-progress').length
    return acc + inProgress
  }, 0) ?? 0
  const projectsStatus = projectsInProgress > 0 ? `${projectsInProgress} active` : 'All complete'

  // Dynamic indicator values based on account type
  const card3Value = isSeller
    ? receivedRfqStats.total
    : isServiceProvider
    ? serviceRequestStats.total
    : rfqStats.sent
  const card3Label = isSeller
    ? 'RFQs Received'
    : isServiceProvider
    ? 'Service Requests'
    : t('home.rfqsSent')

  const card4Value = isSeller
    ? receivedRfqStats.pending
    : isServiceProvider
    ? (serviceRequestStats.new + serviceRequestStats.assigned)
    : rfqStats.active
  const card4Label = isSeller
    ? 'Active — Need Response'
    : isServiceProvider
    ? 'Pending Action'
    : t('home.activeRfqs')

  return (
    <AppLayout>
      <div className="home-page">
        {/* Top indicator cards */}
        <div className="home-indicators">
          <div className="home-indicator-card">
            <div className="home-indicator-icon blue">
              <Icon name="check-square" size={24} />
            </div>
            <div>
              <div className="home-indicator-value">{projectsStatus}</div>
              <div className="home-indicator-label">{t('home.projectsStatus')}</div>
            </div>
          </div>
          <div className="home-indicator-card">
            <div className="home-indicator-icon green">
              <Icon name="folder" size={24} />
            </div>
            <div>
              <div className="home-indicator-value">{projectsTotal}</div>
              <div className="home-indicator-label">{t('home.projectsTotal')}</div>
            </div>
          </div>
          <div className="home-indicator-card">
            <div className="home-indicator-icon purple">
              <Icon name="document" size={24} />
            </div>
            <div>
              <div className="home-indicator-value">{card3Value}</div>
              <div className="home-indicator-label">{card3Label}</div>
            </div>
          </div>
          <div className="home-indicator-card">
            <div className="home-indicator-icon orange">
              <Icon name="clock" size={24} />
            </div>
            <div>
              <div className="home-indicator-value">{card4Value}</div>
              <div className="home-indicator-label">{card4Label}</div>
            </div>
          </div>
        </div>

        {/* ── Dashboard Quick Access ──────────────────────── */}
        {isSuperAdmin ? (
          /* Superadmin sees links to ALL dashboards */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Seller Dashboard', path: '/seller-dashboard', color: '#000888', bg: 'rgba(0,8,136,.06)', border: 'rgba(0,8,136,.2)', desc: 'View all seller data, received RFQs, responses' },
              { label: 'Buyer Dashboard', path: '/buyer-dashboard', color: '#2e7d32', bg: 'rgba(46,125,50,.06)', border: 'rgba(46,125,50,.2)', desc: 'View all buyer data, sent RFQs, comparisons' },
              { label: 'Service Provider Dashboard', path: '/service-provider-dashboard', color: '#e65100', bg: 'rgba(230,81,0,.06)', border: 'rgba(230,81,0,.2)', desc: 'View all service requests and provider activity' },
            ].map((d) => (
              <button
                key={d.path}
                type="button"
                className="stx-click-feedback"
                onClick={() => navigate(d.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px', borderRadius: 14,
                  background: d.bg, border: `1.5px solid ${d.border}`,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: d.border, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: d.color, flexShrink: 0,
                }}>
                  <Icon name="management" size={18} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 1 }}>{d.desc}</div>
                </div>
                <Icon name="chevron-right" size={14} color={d.color} />
              </button>
            ))}
          </div>
        ) : (
          /* Regular users see dashboards for selected account types */
          <div style={{ marginBottom: 20 }}>
            {(() => {
              const dashMap = {
                seller: { label: 'Seller Dashboard', path: '/seller-dashboard', color: '#000888', bg: 'rgba(0,8,136,.06)', border: 'rgba(0,8,136,.2)', desc: `${receivedRfqStats.pending} RFQs pending response · ${receivedRfqStats.awarded} awarded · ${projectsTotal} projects` },
                buyer: { label: 'Buyer Dashboard', path: '/buyer-dashboard', color: '#2e7d32', bg: 'rgba(46,125,50,.06)', border: 'rgba(46,125,50,.2)', desc: `${rfqStats.sent} RFQs sent · ${rfqStats.responses} responses · ${projectsTotal} projects` },
                service_provider: { label: 'Service Provider Dashboard', path: '/service-provider-dashboard', color: '#e65100', bg: 'rgba(230,81,0,.06)', border: 'rgba(230,81,0,.2)', desc: `${projectsTotal} projects · Manage service requests` },
              }
              const dashboards = accountTypes
                .map((type) => dashMap[type])
                .filter(Boolean)
              if (dashboards.length === 0) return null
              if (dashboards.length === 1) {
                const d = dashboards[0]
                return (
                  <button
                    type="button"
                    className="stx-click-feedback"
                    onClick={() => navigate(d.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '16px 22px', borderRadius: 14,
                      background: d.bg, border: `1.5px solid ${d.border}`,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: d.border, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: d.color, flexShrink: 0,
                    }}>
                      <Icon name="management" size={22} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{d.label}</div>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{d.desc}</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: d.color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                      Open Dashboard <Icon name="chevron-right" size={14} />
                    </span>
                  </button>
                )
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  {dashboards.map((d) => (
                    <button
                      key={d.path}
                      type="button"
                      className="stx-click-feedback"
                      onClick={() => navigate(d.path)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 18px', borderRadius: 14,
                        background: d.bg, border: `1.5px solid ${d.border}`,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: d.border, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: d.color, flexShrink: 0,
                      }}>
                        <Icon name="management" size={18} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{d.label}</div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 1 }}>{d.desc}</div>
                      </div>
                      <Icon name="chevron-right" size={14} color={d.color} />
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Explore Platform: 3 main categories ── */}
        <div className="home-main">
          <div className="home-card" style={{ flex: '1 1 100%' }}>
            <h2 className="home-card-title">{t('home.industries')}</h2>
            <p className="home-card-subtitle">Choose a category to explore industries, equipment, products and services.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 8 }}>
              {/* ── Product & Component ── */}
              <button
                type="button"
                className="stx-click-feedback"
                onClick={() => navigate('/product-hub')}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                  padding: '24px 22px', borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(46,125,50,.06) 0%, rgba(46,125,50,.02) 100%)',
                  border: '1.5px solid rgba(46,125,50,.2)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'rgba(46,125,50,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#2e7d32',
                }}>
                  <Icon name="package" size={26} />
                </span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Product &amp; Component</div>
                  <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>Browse products and components across industries</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2e7d32', display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                  Explore <Icon name="chevron-right" size={13} />
                </span>
              </button>

              {/* ── Equipment ── */}
              <button
                type="button"
                className="stx-click-feedback"
                onClick={() => navigate('/equipment-hub')}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                  padding: '24px 22px', borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(0,8,136,.06) 0%, rgba(0,8,136,.02) 100%)',
                  border: '1.5px solid rgba(0,8,136,.2)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'rgba(0,8,136,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#000888',
                }}>
                  <Icon name="wrench" size={26} />
                </span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Equipment</div>
                  <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>Browse equipment categories and suppliers across industries</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#000888', display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                  Explore <Icon name="chevron-right" size={13} />
                </span>
              </button>

              {/* ── Service ── */}
              <button
                type="button"
                className="stx-click-feedback"
                onClick={() => navigate('/service-hub')}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                  padding: '24px 22px', borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(230,81,0,.06) 0%, rgba(230,81,0,.02) 100%)',
                  border: '1.5px solid rgba(230,81,0,.2)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'rgba(230,81,0,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#e65100',
                }}>
                  <Icon name="refresh" size={26} />
                </span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Service</div>
                  <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>Project management, supplier services, quality &amp; compliance</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e65100', display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                  Explore <Icon name="chevron-right" size={13} />
                </span>
              </button>
            </div>
          </div>

          <div className="home-card">
            <h2 className="home-card-title">+ {t('home.quickActions')}</h2>
            <p className="home-card-subtitle">{t('home.quickActionsDesc')}</p>
            <div className="home-quick-actions-list">
              {QUICK_ACTIONS
                .filter((action) => !action.minRole || hasRole(action.minRole))
                .map((action) => {
                  if (action.expandable) {
                    const isOpen = expandedAction === action.id
                    return (
                      <div key={action.id} style={{ display: 'flex', flexDirection: 'column' }}>
                        <button
                          type="button"
                          className="home-quick-action-item stx-click-feedback"
                          onClick={() => setExpandedAction(isOpen ? null : action.id)}
                          style={{ justifyContent: 'space-between' }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="home-quick-action-icon">{getQuickActionIcon(action.icon)}</span>
                            {action.tKey ? t(action.tKey) : action.label}
                          </span>
                          <Icon name="chevron-down" size={16} style={{ transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                        </button>
                        {isOpen && (
                          <div style={{
                            display: 'flex', flexDirection: 'column', gap: 4,
                            paddingLeft: 20, marginTop: 4, marginBottom: 4,
                            borderLeft: '2px solid #e2e8f0',
                          }}>
                            {action.children.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                className="home-quick-action-item"
                                onClick={() => navigate(child.path)}
                                style={{ fontSize: 13, padding: '8px 14px' }}
                              >
                                <span style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: child.color, flexShrink: 0,
                                }} />
                                {child.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <button
                      key={action.id}
                      type="button"
                      className="home-quick-action-item stx-click-feedback"
                      onClick={() => navigate(action.path)}
                    >
                      <span className="home-quick-action-icon">{getQuickActionIcon(action.icon)}</span>
                      {action.tKey ? t(action.tKey) : action.label}
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
