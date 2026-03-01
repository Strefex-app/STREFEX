import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useAuthStore } from '../store/authStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useIndustryStore } from '../store/industryStore'
import { getEffectiveLimits } from '../services/stripeService'
import { useTranslation } from '../i18n/useTranslation'
import '../styles/app-page.css'
import './Home.css'

const INDUSTRIES = [
  { id: 'automotive', tKey: 'industry.automotive', path: '/industry/automotive', descKey: 'industry.description' },
  { id: 'machinery', tKey: 'industry.machinery', path: '/industry/machinery', descKey: 'industry.description' },
  { id: 'electronics', tKey: 'industry.electronics', path: '/industry/electronics', descKey: 'industry.description' },
  { id: 'medical', tKey: 'industry.medical', path: '/industry/medical', descKey: 'industry.description' },
  { id: 'raw-materials', tKey: 'industry.rawMaterials', path: '/industry/raw-materials', descKey: 'industry.description' },
  { id: 'oil-gas', tKey: 'industry.oilGas', path: '/industry/oil-gas', descKey: 'industry.description' },
  { id: 'green-energy', tKey: 'industry.greenEnergy', path: '/industry/green-energy', descKey: 'industry.description' },
  { id: 'household-products', tKey: null, label: 'Household Products', path: '/industry/household-products', descKey: 'industry.description' },
]

const INDUSTRY_ICONS = {
  automotive: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="7.5" cy="18.5" r="2.5" stroke="currentColor" strokeWidth="2"/>
      <circle cx="16.5" cy="18.5" r="2.5" stroke="currentColor" strokeWidth="2"/>
      <path d="M3 18h2M14 18h5a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.63l-3.5-4.35A1 1 0 0 0 15.5 8H3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 18h4" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  machinery: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  electronics: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  medical: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  'raw-materials': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  'oil-gas': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8 6 4 9.5 4 14a8 8 0 0 0 16 0c0-4.5-4-8-8-12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 18a4 4 0 0 1-4-4c0-2.5 4-6 4-6s4 3.5 4 6a4 4 0 0 1-4 4z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  'green-energy': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  'household-products': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-6v-6H10v6H4a1 1 0 0 1-1-1V10.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
}

export default function ProductHub() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isSuperAdmin = useAuthStore((s) => s.role === 'superadmin')
  const accountType = useSubscriptionStore((s) => s.accountType)
  const planId = useSubscriptionStore((s) => s.planId)
  const limits = getEffectiveLimits(planId, accountType)
  const maxIndustries = isSuperAdmin ? Infinity : (limits.maxIndustries ?? 1)
  const allIndustriesOpen = maxIndustries === Infinity

  const isServiceProvider = accountType === 'service_provider' && !isSuperAdmin

  const selectedIndustries = useIndustryStore((s) => s.selectedIndustries)
  const selectIndustry = useIndustryStore((s) => s.selectIndustry)
  const isSelected = useIndustryStore((s) => s.isSelected)

  const [showPicker, setShowPicker] = useState(false)

  return (
    <AppLayout>
      <div className="app-page" style={{ maxWidth: 960, margin: '0 auto' }}>
        <a
          className="app-page-back-link"
          href="/main-menu"
          onClick={(e) => { e.preventDefault(); navigate(-1) }}
        >
          ← Back
        </a>

        <div className="app-page-card">
          <h2 className="app-page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(46,125,50,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2e7d32' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2"/>
                <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            Product &amp; Component
          </h2>
          <p className="app-page-subtitle">
            Browse products and components across industries. Select an industry to view available product categories and suppliers.
          </p>
        </div>

        {isServiceProvider ? (
          <div className="app-page-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <p style={{ color: '#888', fontSize: 15 }}>Service Provider accounts do not have access to Product & Component pages. Please use the Service section instead.</p>
            <button onClick={() => navigate('/service-hub')} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 8, background: '#000888', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              Go to Services
            </button>
          </div>
        ) : (
          <div className="app-page-card">
            <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              {allIndustriesOpen
                ? 'Select an industry to browse product categories and suppliers.'
                : selectedIndustries.length === 0
                ? 'Choose your industry to register and access product categories.'
                : selectedIndustries.length < maxIndustries
                ? `Registered in ${selectedIndustries.length} of ${maxIndustries} industries — you can add more.`
                : `Registered in ${selectedIndustries.length} industry — select product category inside.`}
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              {INDUSTRIES.map((item) => {
                const chosen = isSelected(item.id)
                const slotsLeft = maxIndustries - selectedIndustries.length
                const canPick = slotsLeft > 0

                if (allIndustriesOpen || chosen) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(`/product-hub/${item.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '16px 20px', borderRadius: 12,
                        background: chosen ? 'rgba(46,125,50,.04)' : '#fff',
                        border: chosen ? '2px solid #2e7d32' : '1px solid #e2e8f0',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        transition: 'all .15s',
                      }}
                    >
                      <span style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: chosen ? 'rgba(46,125,50,.1)' : '#f8fafc',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: chosen ? '#2e7d32' : '#64748b', flexShrink: 0,
                      }}>
                        {INDUSTRY_ICONS[item.id] || INDUSTRY_ICONS.machinery}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>
                          {item.tKey ? t(item.tKey) : item.label || item.id}
                          {chosen && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}>Registered</span>}
                        </div>
                        <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Browse product categories and suppliers</div>
                      </div>
                      <span style={{ color: '#2e7d32', fontSize: 20, fontWeight: 300 }}>→</span>
                    </button>
                  )
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => canPick ? setShowPicker(item.id) : navigate('/plans')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '16px 20px', borderRadius: 12,
                      background: '#fff', border: '1px solid #e2e8f0',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      opacity: canPick ? 1 : 0.6, transition: 'all .15s',
                    }}
                  >
                    <span style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#64748b', flexShrink: 0,
                    }}>
                      {INDUSTRY_ICONS[item.id] || INDUSTRY_ICONS.machinery}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>
                        {item.tKey ? t(item.tKey) : item.label || item.id}
                        {!canPick && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 6, verticalAlign: 'middle', opacity: 0.5 }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                        {canPick ? 'Click to register in this industry' : 'Upgrade plan to access'}
                      </div>
                    </div>
                    <span style={{ color: canPick ? '#2e7d32' : '#ccc', fontSize: 20, fontWeight: 300 }}>{canPick ? '+' : '↑'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Registration confirmation modal */}
        {showPicker && (
          <div className="home-modal-overlay" onClick={() => setShowPicker(false)}>
            <div className="home-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Register Industry</h3>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.5 }}>
                Register your company under <strong>{(() => {
                  const selected = INDUSTRIES.find((i) => i.id === showPicker)
                  return selected?.tKey ? t(selected.tKey) : selected?.label || showPicker
                })()}</strong>?
                {!allIndustriesOpen && (
                  <><br /><span style={{ color: '#e65100', fontSize: 13 }}>
                    Your plan allows {maxIndustries} {maxIndustries === 1 ? 'industry' : 'industries'}.
                  </span></>
                )}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowPicker(false)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    selectIndustry(showPicker, maxIndustries)
                    setShowPicker(false)
                    navigate(`/product-hub/${showPicker}`)
                  }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Confirm & Enter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
