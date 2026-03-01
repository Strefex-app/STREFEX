import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useProjectStore } from '../store/projectStore'
import useRfqStore from '../store/rfqStore'
import { useSubscriptionStore } from '../services/featureFlags'
import { useIndustryStore } from '../store/industryStore'
import { useAuthStore } from '../store/authStore'
import { getEffectiveLimits } from '../services/stripeService'
import { getEquipmentCategoriesForIndustry } from '../data/equipmentCategoriesByIndustry'
import { useTranslation } from '../i18n/useTranslation'
import Icon from '../components/Icon'
import './IndustryHub.css'

const INDUSTRY_TKEYS = {
  automotive: 'industry.automotive',
  machinery: 'industry.machinery',
  electronics: 'industry.electronics',
  medical: 'industry.medical',
  'raw-materials': 'industry.rawMaterials',
}

const IndustryHub = () => {
  const navigate = useNavigate()
  const { industryId } = useParams()
  const { t } = useTranslation()
  const title = INDUSTRY_TKEYS[industryId] ? t(INDUSTRY_TKEYS[industryId]) : `${industryId || 'Industry'}`
  const description = t('industry.description')
  const basePath = `/industry/${industryId}`

  /* ── Plan & account gating ──────────────────────────── */
  const hasExecSummary = useSubscriptionStore((s) => s.hasFeature('executiveSummary'))
  const accountType = useSubscriptionStore((s) => s.accountType)
  const planId = useSubscriptionStore((s) => s.planId)
  const isSuperAdmin = useAuthStore((s) => s.role === 'superadmin')
  const limits = getEffectiveLimits(planId, accountType)
  // Superadmin sees everything — treated as buyer with full access
  const isBuyer = isSuperAdmin || accountType === 'buyer'
  const isSeller = !isSuperAdmin && (accountType === 'seller' || accountType === 'service_provider')
  const isRawMaterials = industryId === 'raw-materials'

  /* ── Seller equipment-category registration (inline) ── */
  const categories = getEquipmentCategoriesForIndustry(industryId)
  const maxCategories = isSuperAdmin ? Infinity : (limits.maxCategories ?? 1)
  const allCategoriesOpen = maxCategories === Infinity
  const selectedCats = useIndustryStore((s) => s.getCategoriesForIndustry(industryId))
  const selectCategory = useIndustryStore((s) => s.selectCategory)
  const isCategorySelected = useIndustryStore((s) => s.isCategorySelected)
  const [showCatPicker, setShowCatPicker] = useState(false)

  // Get stats from stores
  const projects = useProjectStore((state) => state.projects)
  const { getRfqStats } = useRfqStore()
  const rfqStats = getRfqStats(industryId)

  const projectsTotal = projects?.length ?? 0
  const projectsInProgress = projects?.reduce((acc, p) => {
    const inProgress = (p.tasks || []).filter(t => t.status === 'in-progress').length
    return acc + inProgress
  }, 0) ?? 0
  const projectsStatus = projectsInProgress > 0 ? `${projectsInProgress} active` : 'All complete'

  const quickActions = [
    { id: 'equipment', label: 'Equipment Supplier Selection', icon: 'document', path: `${basePath}/equipment-request` },
    { id: 'service', label: 'Service', icon: 'refresh', path: `${basePath}/services` },
    { id: 'audit', label: 'Audit Request', icon: 'monitor', path: `${basePath}/audit-request` },
    {
      id: 'add',
      label: 'Add New Supplier',
      icon: 'plus',
      path: `/add-supplier?industry=${encodeURIComponent(industryId)}&industryLabel=${encodeURIComponent(title)}&context=equipment`,
    },
    { id: 'project', label: 'Project Management', icon: 'gantt', path: '/project-management' },
  ]

  /* ── Sub-pages (buyer/seller aware — superadmin sees all) */
  const subPages = [
    // Buyers: browsable equipment page. Sellers: hidden (they register inline below). Superadmin: always visible.
    // Executive Summary is now accessed per equipment category inside the equipment page.
    { id: 'equipment', label: 'Related Equipment', description: 'Browse equipment categories, registered sellers & executive summary', path: 'equipment', icon: 'document', accessible: true, hidden: isSeller },
  ]

  const lockIcon = <Icon name="lock" size={14} style={{ marginLeft: 6, verticalAlign: 'middle', opacity: 0.5 }} />

  const getCategoryIcon = (catId) => {
    if (catId.includes('mold') || catId.includes('injection')) return <Icon name="mold-grid" size={20} />
    if (catId.includes('robot') || catId.includes('automation')) return <Icon name="robot-face" size={20} />
    if (catId.includes('test') || catId.includes('inspection')) return <Icon name="check-circle" size={20} />
    return <Icon name="wrench" size={20} />
  }

  /* ── Render seller category row (register, not browse) ─ */
  const renderSellerCategory = (cat) => {
    const chosen = isCategorySelected(industryId, cat.id)

    if (chosen) {
      return (
        <div key={cat.id} className="industry-hub-page-item home-industry-chosen">
          <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
          <div className="industry-hub-page-info">
            <div className="industry-hub-page-name">
              {cat.name}
              <span className="home-industry-badge">Registered</span>
            </div>
            <div className="industry-hub-page-desc">{cat.description}</div>
          </div>
          <span className="industry-hub-page-arrow" style={{ color: '#27ae60' }}>✓</span>
        </div>
      )
    }

    if (allCategoriesOpen) {
      return (
        <div key={cat.id} className="industry-hub-page-item" onClick={() => setShowCatPicker(cat.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setShowCatPicker(cat.id)} title="Click to register under this equipment category">
          <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
          <div className="industry-hub-page-info">
            <div className="industry-hub-page-name">{cat.name}</div>
            <div className="industry-hub-page-desc">Click to register</div>
          </div>
          <span className="industry-hub-page-arrow">+</span>
        </div>
      )
    }

    const slotsLeft = maxCategories - selectedCats.length
    const canPick = slotsLeft > 0
    return (
      <div
        key={cat.id}
        className={`industry-hub-page-item ${canPick ? '' : 'locked'}`}
        onClick={() => canPick ? setShowCatPicker(cat.id) : navigate('/plans')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && (canPick ? setShowCatPicker(cat.id) : navigate('/plans'))}
        title={canPick ? 'Click to register under this equipment category' : 'Upgrade to access more categories'}
      >
        <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
        <div className="industry-hub-page-info">
          <div className="industry-hub-page-name">
            {cat.name}
            {!canPick && lockIcon}
          </div>
          <div className="industry-hub-page-desc">{canPick ? 'Click to register' : 'Upgrade plan to access'}</div>
        </div>
        <span className="industry-hub-page-arrow">{canPick ? '+' : '↑'}</span>
      </div>
    )
  }

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
          <h1 className="industry-hub-title">{title}</h1>
          <p className="industry-hub-subtitle">{description}</p>
        </div>

        {/* Top indicator cards */}
        <div className="industry-hub-indicators">
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon blue">
              <Icon name="check-circle" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">{projectsStatus}</div>
              <div className="industry-hub-indicator-label">{t('home.projectsStatus')}</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon green">
              <Icon name="folder" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">{projectsTotal}</div>
              <div className="industry-hub-indicator-label">{t('home.projectsTotal')}</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon purple">
              <Icon name="document" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">{rfqStats.sent}</div>
              <div className="industry-hub-indicator-label">{t('home.rfqsSent')}</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon orange">
              <Icon name="clock" size={24} />
            </div>
            <div>
              <div className="industry-hub-indicator-value">{rfqStats.active}</div>
              <div className="industry-hub-indicator-label">{t('home.activeRfqs')}</div>
            </div>
          </div>
        </div>

        {/* Main: Pages on left + Quick Actions on right */}
        <div className="industry-hub-main">
          <div className="industry-hub-card">
            {/* ── Seller: inline category registration ── */}
            {isSeller && (
              <>
                <h2 className="industry-hub-card-title">{isRawMaterials ? 'Material Categories' : 'Equipment Category Registration'}</h2>
                <p className="industry-hub-card-subtitle">
                  {allCategoriesOpen
                    ? `Register your company under one or more ${isRawMaterials ? 'material' : 'equipment'} categories.`
                    : selectedCats.length === 0
                    ? `Choose your ${isRawMaterials ? 'material' : 'equipment'} category to register your company.`
                    : `${selectedCats.length} of ${maxCategories} ${maxCategories === 1 ? 'category' : 'categories'} registered.`}
                </p>
                <div className="industry-hub-pages-list">
                  {categories.length === 0 ? (
                    <div className="industry-hub-empty">No {isRawMaterials ? 'material' : 'equipment'} categories for this industry yet.</div>
                  ) : (
                    categories.map(renderSellerCategory)
                  )}
                </div>
              </>
            )}

            {/* ── Buyer: sub-pages (Equipment, Exec Summary, Schedule) ── */}
            {isBuyer && (
              <>
                {/* For raw-materials, show material categories inline instead of equipment sub-page */}
                {isRawMaterials ? (
                  <>
                    <h2 className="industry-hub-card-title">Material Categories</h2>
                    <p className="industry-hub-card-subtitle">Browse material categories and registered sellers.</p>
                    <div className="industry-hub-pages-list">
                      {categories.length === 0 ? (
                        <div className="industry-hub-empty">No material categories yet.</div>
                      ) : (
                        categories.map((cat) => {
                          const canSeeExec = isSuperAdmin || hasExecSummary
                          return (
                            <div key={cat.id} className="industry-hub-page-item eq-cat-row">
                              <div className="eq-cat-main">
                                <span className="industry-hub-page-icon">{getCategoryIcon(cat.id)}</span>
                                <div className="industry-hub-page-info">
                                  <div className="industry-hub-page-name">{cat.name}</div>
                                  <div className="industry-hub-page-desc">{cat.description}</div>
                                </div>
                              </div>
                              {canSeeExec && (
                                <button
                                  className="eq-cat-exec-btn"
                                  onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/equipment/${cat.id}/executive-summary`) }}
                                  title="View Executive Summary for this material category"
                                >
                                  <Icon name="chart" size={14} />
                                  Executive Summary
                                </button>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="industry-hub-card-title">Pages</h2>
                    <p className="industry-hub-card-subtitle">Industry sections and reports.</p>
                    <div className="industry-hub-pages-list">
                      {subPages
                        .filter((page) => !page.hidden)
                        .map((page) => (
                          <div
                            key={page.id}
                            className={`industry-hub-page-item ${page.accessible ? '' : 'locked'}`}
                            onClick={() => page.accessible ? navigate(`${basePath}/${page.path}`) : navigate('/plans')}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && (page.accessible ? navigate(`${basePath}/${page.path}`) : navigate('/plans'))}
                            title={page.accessible ? page.description : 'Upgrade to Standard or higher to access'}
                          >
                            <span className="industry-hub-page-icon"><Icon name={page.icon} size={20} /></span>
                            <div className="industry-hub-page-info">
                              <div className="industry-hub-page-name">
                                {page.label}
                                {!page.accessible && lockIcon}
                              </div>
                              <div className="industry-hub-page-desc">
                                {page.accessible ? page.description : 'Upgrade to Standard plan to access'}
                              </div>
                            </div>
                            <span className="industry-hub-page-arrow">{page.accessible ? '→' : '↑'}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </>
            )}

          </div>

          {/* Category selection confirmation modal (seller) */}
          {showCatPicker && isSeller && (
            <div className="home-modal-overlay" onClick={() => setShowCatPicker(false)}>
              <div className="home-modal" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Register {isRawMaterials ? 'Material' : 'Equipment'} Category</h3>
                <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.5 }}>
                  Register your company under <strong>{categories.find(c => c.id === showCatPicker)?.name || showCatPicker}</strong>?
                  {!allCategoriesOpen && (
                    <><br /><span style={{ color: '#e65100', fontSize: 13 }}>Your plan allows {maxCategories} {isRawMaterials ? 'material' : 'equipment'} {maxCategories === 1 ? 'category' : 'categories'}. You can change it later or upgrade for more.</span></>
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
                      setShowCatPicker(false)
                    }}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#000888', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    Confirm Registration
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions (Right) */}
          <div className="industry-hub-card">
            <h2 className="industry-hub-card-title">+ {t('home.quickActions')}</h2>
            <p className="industry-hub-card-subtitle">{t('home.quickActionsDesc')}</p>
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

export default IndustryHub
