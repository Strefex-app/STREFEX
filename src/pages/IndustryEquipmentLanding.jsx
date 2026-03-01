import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import Icon from '../components/Icon'
import { getEquipmentCategoriesForIndustry } from '../data/equipmentCategoriesByIndustry'
import { useSubscriptionStore } from '../services/featureFlags'
import { useIndustryStore } from '../store/industryStore'
import { useAuthStore } from '../store/authStore'
import { useAccountRegistry } from '../store/accountRegistry'
import { getEffectiveLimits } from '../services/stripeService'
import './IndustryHub.css'

const INDUSTRY_LABELS = {
  automotive: 'Automotive Industry',
  machinery: 'Machinery Industry',
  electronics: 'Electronics Industry',
  medical: 'Medical Industry',
  'raw-materials': 'Raw Materials',
}

const IndustryEquipmentLanding = () => {
  const navigate = useNavigate()
  const { industryId } = useParams()
  const title = INDUSTRY_LABELS[industryId] || `${industryId || 'Industry'}`
  const isRawMaterials = industryId === 'raw-materials'
  const categories = getEquipmentCategoriesForIndustry(industryId)
  const basePath = `/industry/${industryId}/equipment`
  const industryBasePath = `/industry/${industryId}`

  /* ── Subscription & category gating ──────────────────── */
  const planId = useSubscriptionStore((s) => s.planId)
  const accountType = useSubscriptionStore((s) => s.accountType)
  const isSuperAdmin = useAuthStore((s) => s.role === 'superadmin')
  const limits = getEffectiveLimits(planId, accountType)
  const maxCategories = isSuperAdmin ? Infinity : (limits.maxCategories ?? 1)
  const allCategoriesOpen = maxCategories === Infinity

  const selectedCats = useIndustryStore((s) => s.getCategoriesForIndustry(industryId))
  const selectCategory = useIndustryStore((s) => s.selectCategory)
  const isCategorySelected = useIndustryStore((s) => s.isCategorySelected)

  const [showCatPicker, setShowCatPicker] = useState(false) // categoryId or false

  /* ── Executive Summary access (buyers + superadmin) ── */
  const isBuyer = accountType === 'buyer'
  const canSeeExecSummary = isSuperAdmin || isBuyer

  /* ── Seller counts from registry (for buyer view) ────── */
  const sellerCounts = useAccountRegistry((s) => s.getSellerCountByCategory(industryId))

  /* ── Sellers/Service Providers cannot access this page — redirect (superadmin exempt) ── */
  const isSellerLike = accountType === 'seller' || accountType === 'service_provider'
  useEffect(() => {
    if (isSellerLike && !isSuperAdmin) {
      navigate(`/industry/${industryId}`, { replace: true })
    }
  }, [isSellerLike, industryId, navigate, isSuperAdmin])

  if (isSellerLike && !isSuperAdmin) return null

  const quickActions = [
    { id: 'rfq', label: 'Request Equipment Quote', icon: 'document', path: `${industryBasePath}/equipment-request` },
    { id: 'audit', label: 'Request Supplier Audit', icon: 'monitor', path: `${industryBasePath}/audit-request` },
    {
      id: 'add',
      label: 'Add New Supplier',
      icon: 'plus',
      path: `/add-supplier?industry=${encodeURIComponent(industryId)}&industryLabel=${encodeURIComponent(title)}&context=equipment`,
    },
  ]

  const getCategoryIcon = (catId) => {
    if (catId.includes('mold') || catId.includes('injection')) return <Icon name="mold-grid" size={20} />
    if (catId.includes('robot') || catId.includes('automation')) return <Icon name="robot-face" size={20} />
    if (catId.includes('test') || catId.includes('inspection')) return <Icon name="check-circle" size={20} />
    return <Icon name="wrench" size={20} />
  }

  const lockIcon = <Icon name="lock" size={14} style={{ marginLeft: 6, verticalAlign: 'middle', opacity: 0.5 }} />

  /* ── Render a single category row ──────────────────── */
  const renderCategory = (cat) => {
    const chosen = isCategorySelected(industryId, cat.id)

    const count = sellerCounts[cat.id] || 0
    const countLabel = count > 0 ? ` · ${count} seller${count > 1 ? 's' : ''} registered` : ''

    // Helper: Executive Summary button (shown inside accessible categories)
    const execSummaryBtn = canSeeExecSummary ? (
      <button
        className="eq-cat-exec-btn"
        onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/${cat.id}/executive-summary`) }}
        title="View Executive Summary for this equipment category"
      >
        <Icon name="chart" size={14} />
        Executive Summary
      </button>
    ) : null

    // Basic+ plan → all categories accessible (category is the final level — no sub-page)
    if (allCategoriesOpen) {
      return (
        <div key={cat.id} className="industry-hub-page-item eq-cat-row">
          <div className="eq-cat-main">
            <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
            <div className="industry-hub-page-info">
              <div className="industry-hub-page-name">{cat.name}</div>
              <div className="industry-hub-page-desc">{cat.description}{countLabel}</div>
            </div>
          </div>
          {execSummaryBtn}
        </div>
      )
    }

    // Free plan: chosen category → registered (category is the final level)
    if (chosen) {
      return (
        <div key={cat.id} className="industry-hub-page-item home-industry-chosen eq-cat-row">
          <div className="eq-cat-main">
            <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
            <div className="industry-hub-page-info">
              <div className="industry-hub-page-name">
                {cat.name}
                <span className="home-industry-badge">Registered</span>
              </div>
              <div className="industry-hub-page-desc">{cat.description}{countLabel}</div>
            </div>
          </div>
          {execSummaryBtn}
        </div>
      )
    }

    // Free plan: not chosen — allow picking if slots remain, else lock
    const slotsLeft = maxCategories - selectedCats.length
    const canPick = slotsLeft > 0

    return (
      <div
        key={cat.id}
        className={`industry-hub-page-item ${canPick ? '' : 'locked'}`}
        onClick={() => {
          if (canPick) {
            setShowCatPicker(cat.id)
          } else {
            navigate('/plans')
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && (canPick ? setShowCatPicker(cat.id) : navigate('/plans'))}
        title={canPick ? 'Click to register this equipment category' : 'Upgrade to Basic or higher for more categories'}
      >
        <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
        <div className="industry-hub-page-info">
          <div className="industry-hub-page-name">
            {cat.name}
            {!canPick && lockIcon}
          </div>
          <div className="industry-hub-page-desc">
            {canPick ? 'Click to choose this category' : 'Upgrade plan to access'}
          </div>
        </div>
        <span className="industry-hub-page-arrow">{canPick ? '+' : '↑'}</span>
      </div>
    )
  }

  const catWord = isRawMaterials ? 'material' : 'equipment'
  const subtitleText = allCategoriesOpen
    ? `${title} — Browse ${catWord} categories and registered sellers`
    : selectedCats.length === 0
    ? `${title} — Choose your ${catWord} category`
    : `${title} — ${selectedCats.length} of ${maxCategories} ${maxCategories === 1 ? 'category' : 'categories'} selected`

  return (
    <AppLayout>
      <div className="industry-hub-page">
        {/* Header */}
        <div className="industry-hub-header">
          <a
            className="industry-hub-back-link"
            href="/equipment-hub"
            onClick={(e) => { e.preventDefault(); navigate(-1) }}
          >
            ← Back
          </a>
          <h1 className="industry-hub-title">{isRawMaterials ? 'Material Categories & Sellers' : 'Equipment & Sellers'}</h1>
          <p className="industry-hub-subtitle">{subtitleText}</p>
        </div>

        {/* Stats Row */}
        <div className="industry-hub-indicators">
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon blue">
              <Icon name="grid-cols" size={24} />
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
              <div className="industry-hub-indicator-value">45+</div>
              <div className="industry-hub-indicator-label">Suppliers</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon purple">
              <Icon name="stars" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">4.5</div>
              <div className="industry-hub-indicator-label">Avg Rating</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon orange">
              <Icon name="clock" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">24h</div>
              <div className="industry-hub-indicator-label">Avg Response</div>
            </div>
          </div>
        </div>

        {/* Main: Categories on left + Quick Actions on right */}
        <div className="industry-hub-main">
          {/* Categories (Left) */}
          <div className="industry-hub-card">
            <h2 className="industry-hub-card-title">Equipment Categories</h2>
            <p className="industry-hub-card-subtitle">
              {allCategoriesOpen
                ? 'Tap a category to browse equipment and registered sellers.'
                : selectedCats.length === 0
                ? 'Choose your equipment category to browse sellers.'
                : `${selectedCats.length} of ${maxCategories} ${maxCategories === 1 ? 'category' : 'categories'} selected.`}
            </p>
            <div className="industry-hub-pages-list">
              {categories.length === 0 ? (
                <div className="industry-hub-empty">
                  No equipment categories for this industry yet. Connect your database to load more.
                </div>
              ) : (
                categories.map(renderCategory)
              )}
            </div>
          </div>

          {/* Category selection confirmation modal */}
          {showCatPicker && (
            <div className="home-modal-overlay" onClick={() => setShowCatPicker(false)}>
              <div className="home-modal" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Select Equipment Category</h3>
                <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.5 }}>
                  Browse sellers under <strong>{categories.find(c => c.id === showCatPicker)?.name || showCatPicker}</strong>?
                  {!allCategoriesOpen && (
                    <><br /><span style={{ color: '#e65100', fontSize: 13 }}>Your plan allows {maxCategories} equipment {maxCategories === 1 ? 'category' : 'categories'}. Upgrade for more.</span></>
                  )}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowCatPicker(false)}
                    style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      selectCategory(industryId, showCatPicker, maxCategories)
                      navigate(`${basePath}/${showCatPicker}/executive-summary`)
                      setShowCatPicker(false)
                    }}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#000888', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions (Right) */}
          <div className="industry-hub-card">
            <h2 className="industry-hub-card-title">+ Quick Actions</h2>
            <p className="industry-hub-card-subtitle">Common tasks you can do quickly.</p>
            <div className="industry-hub-actions-list">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="industry-hub-action-item"
                  onClick={() => action.path && navigate(action.path)}
                >
                  <span className="industry-hub-action-icon"><Icon name={action.icon} size={20} /></span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export default IndustryEquipmentLanding
