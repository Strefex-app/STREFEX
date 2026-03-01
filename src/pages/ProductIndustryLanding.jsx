import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import Icon from '../components/Icon'
import { getProductCategoriesForIndustry } from '../data/productCategoriesByIndustry'
import { useTranslation } from '../i18n/useTranslation'
import { useSubscriptionStore } from '../services/featureFlags'
import { useAuthStore } from '../store/authStore'
import '../styles/app-page.css'
import './IndustryHub.css'

const INDUSTRY_LABELS = {
  automotive: 'Automotive',
  machinery: 'Machinery',
  electronics: 'Electronics',
  medical: 'Medical',
  'raw-materials': 'Raw Materials',
  'oil-gas': 'Oil & Gas',
  'green-energy': 'Green Energy',
  'household-products': 'Household Products',
}

const getCategoryIcon = (catId) => {
  const iconMap = { plastic: 'plastic', metal: 'metal', rubber: 'rubber', composites: 'composites', ceramics: 'ceramics', 'electronics-assembly': 'electronics-assembly', glass: 'glass', textile: 'textile' }
  return <Icon name={iconMap[catId] || 'hexagon'} size={24} />
}

export default function ProductIndustryLanding() {
  const navigate = useNavigate()
  const { industryId } = useParams()
  const { t } = useTranslation()
  const industryLabel = INDUSTRY_LABELS[industryId] || industryId
  const categories = getProductCategoriesForIndustry(industryId)
  const accountType = useSubscriptionStore((s) => s.accountType)
  const isSuperAdmin = useAuthStore((s) => s.role === 'superadmin')
  const canSeeExecSummary = isSuperAdmin || accountType === 'buyer'

  return (
    <AppLayout>
      <div className="industry-hub-page">
        {/* Header */}
        <div className="industry-hub-header">
          <a
            className="industry-hub-back-link"
            href="/product-hub"
            onClick={(e) => { e.preventDefault(); navigate(-1) }}
          >
            ← Back
          </a>
          <h1 className="industry-hub-title">Product & Component — {industryLabel}</h1>
          <p className="industry-hub-subtitle">
            Browse manufacturing categories relevant to the <strong>{industryLabel}</strong> industry. Each category shows processes and suppliers specific to this sector.
          </p>
        </div>

        {/* Stats Row */}
        <div className="industry-hub-indicators">
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon blue">
              <Icon name="hexagon" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">{categories.length}</div>
              <div className="industry-hub-indicator-label">Categories</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon green">
              <Icon name="users" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">{categories.reduce((sum, c) => sum + c.subcategories.length, 0)}</div>
              <div className="industry-hub-indicator-label">Processes</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon purple">
              <Icon name="profile" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">120+</div>
              <div className="industry-hub-indicator-label">Suppliers</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon orange">
              <Icon name="stars" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">4.6</div>
              <div className="industry-hub-indicator-label">Avg Rating</div>
            </div>
          </div>
        </div>

        {/* Manufacturing Categories Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 4 }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => navigate(canSeeExecSummary ? `/product-hub/${industryId}/${cat.id}/executive-summary` : `/product-hub/${industryId}/${cat.id}`)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                padding: '20px 22px', borderRadius: 14,
                background: '#fff', border: '1.5px solid #e2e8f0',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.boxShadow = `0 2px 12px ${cat.color}18` }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `${cat.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: cat.color, flexShrink: 0,
                }}>
                  {getCategoryIcon(cat.id)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{cat.name}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: `${cat.color}12`, color: cat.color, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
                    }}>
                      {industryLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{cat.description}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {cat.subcategories.slice(0, 4).map((sub) => (
                  <span key={sub.id} style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 5,
                    background: '#f1f5f9', color: '#475569', fontWeight: 500,
                  }}>
                    {sub.name}
                  </span>
                ))}
                {cat.subcategories.length > 4 && (
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 5,
                    background: '#f1f5f9', color: '#888', fontWeight: 500,
                  }}>
                    +{cat.subcategories.length - 4} more
                  </span>
                )}
              </div>

              <span style={{
                fontSize: 13, fontWeight: 600, color: cat.color,
                display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto',
              }}>
                {cat.subcategories.length} processes → {canSeeExecSummary ? 'Executive Summary' : 'Browse Subcategories'}
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canSeeExecSummary && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/product-hub/${industryId}/${cat.id}/executive-summary`)
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 12px', borderRadius: 8, border: 'none',
                      background: cat.color, color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Executive Summary
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/product-hub/${industryId}/${cat.id}`)
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8,
                    border: `1px solid ${cat.color}`, background: '#fff',
                    color: cat.color, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Browse Subcategories
                </button>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
