import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { getManufacturingCategory } from '../data/productCategoriesByIndustry'
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

/* ── Inline SVG icons ─────────────────────────────────────────────────────── */
const ChartIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M3 3V21H21M7 16l5-5 4 4 5-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const DocIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const PlusIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const ProcessIcon = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function ProductSubcategoryPage() {
  const navigate = useNavigate()
  const { industryId, categoryId } = useParams()
  const industryLabel = INDUSTRY_LABELS[industryId] || industryId
  const category = getManufacturingCategory(categoryId, industryId)

  const isSuperAdmin = useAuthStore((s) => s.role === 'superadmin')
  const accountType = useSubscriptionStore((s) => s.accountType)
  const isSeller = !isSuperAdmin && (accountType === 'seller' || accountType === 'service_provider')
  const isBuyer = accountType === 'buyer'
  const canSeeExecSummary = isSuperAdmin || isBuyer

  const [expandedSub, setExpandedSub] = useState(null)

  /** Build URL with pre-filled product context query params */
  const quoteUrl = (sub) => {
    const p = new URLSearchParams({
      industry: industryId,
      industryLabel,
      productCategory: category.name,
      process: sub.name,
      context: 'product',
    })
    return `/equipment-request?${p.toString()}`
  }
  const addSupplierUrl = (sub) => {
    const p = new URLSearchParams({
      industry: industryId,
      industryLabel,
      productCategory: category.name,
      process: sub.name,
      context: 'product',
    })
    return `/add-supplier?${p.toString()}`
  }

  if (!category) {
    return (
      <AppLayout>
        <div className="app-page" style={{ maxWidth: 960, margin: '0 auto' }}>
          <a
            className="app-page-back-link"
            href="#"
            onClick={(e) => { e.preventDefault(); navigate(-1) }}
          >
            ← Back
          </a>
          <div className="app-page-card" style={{ textAlign: 'center', padding: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Category not found</h2>
            <p style={{ color: '#888' }}>The manufacturing category "{categoryId}" was not found.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  const subcategories = category.subcategories || []

  return (
    <AppLayout>
      <div className="industry-hub-page">
        {/* Header */}
        <div className="industry-hub-header">
          <a
            className="industry-hub-back-link"
            href={`/product-hub/${industryId}`}
            onClick={(e) => { e.preventDefault(); navigate(-1) }}
          >
            ← Back
          </a>
          <h1 className="industry-hub-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${category.color}14`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: category.color,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2"/>
                <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            {category.name} — {industryLabel}
          </h1>
          <p className="industry-hub-subtitle">
            <span style={{
              display: 'inline-block', fontSize: 10, padding: '2px 7px', borderRadius: 4,
              background: `${category.color}12`, color: category.color, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 8, verticalAlign: 'middle',
            }}>
              {industryLabel}
            </span>
            {category.description}. Select a manufacturing process to view suppliers.
          </p>
        </div>

        {/* Stats */}
        <div className="industry-hub-indicators">
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M9 3v18M15 3v18" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <div>
              <div className="industry-hub-indicator-value">{subcategories.length}</div>
              <div className="industry-hub-indicator-label">Processes</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <div>
              <div className="industry-hub-indicator-value">--</div>
              <div className="industry-hub-indicator-label">Suppliers</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="industry-hub-indicator-value">4.5</div>
              <div className="industry-hub-indicator-label">Avg Rating</div>
            </div>
          </div>
          <div className="industry-hub-indicator-card">
            <div className="industry-hub-indicator-icon orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="industry-hub-indicator-value">24h</div>
              <div className="industry-hub-indicator-label">Avg Response</div>
            </div>
          </div>
        </div>

        {/* Sub-processes + Quick Actions layout */}
        <div className="industry-hub-main">
          {/* Manufacturing Processes */}
          <div className="industry-hub-card">
            <h2 className="industry-hub-card-title">{category.name} — Manufacturing Processes</h2>
            <p className="industry-hub-card-subtitle">
              Select a {category.name.toLowerCase()} manufacturing process for the <strong>{industryLabel}</strong> industry to view suppliers, executive summary and request quotes.
            </p>

            <div className="industry-hub-pages-list">
              {subcategories.map((sub) => {
                const isExpanded = expandedSub === sub.id
                return (
                  <div key={sub.id}>
                    {/* ── Process row ── */}
                    <div
                      className={`industry-hub-page-item ${isExpanded ? 'home-industry-chosen' : ''}`}
                      onClick={() => setExpandedSub(isExpanded ? null : sub.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setExpandedSub(isExpanded ? null : sub.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="industry-hub-page-icon" style={{ color: category.color }}>
                        <ProcessIcon color={category.color} />
                      </span>
                      <div className="industry-hub-page-info">
                        <div className="industry-hub-page-name">{sub.name}</div>
                        <div className="industry-hub-page-desc">{sub.description}</div>
                      </div>
                      <span className="industry-hub-page-arrow" style={{ color: category.color }}>
                        {isExpanded ? '▼' : '→'}
                      </span>
                    </div>

                    {/* ── Expanded inline panel ── */}
                    {isExpanded && (
                      <div style={{
                        margin: '-4px 0 8px',
                        padding: '20px 24px',
                        borderRadius: '0 0 12px 12px',
                        background: `${category.color}06`,
                        border: `1px solid ${category.color}25`,
                        borderTop: 'none',
                      }}>
                        {/* ── Header with industry badge ── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                            {sub.name}
                          </h3>
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 4,
                            background: `${category.color}12`, color: category.color, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                          }}>
                            {industryLabel} · {category.name}
                          </span>
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                          {sub.description}
                        </p>

                        {/* ── Supplier list placeholder ── */}
                        <div style={{
                          padding: '12px 14px', borderRadius: 10, background: '#fff',
                          border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12,
                          marginBottom: 14,
                        }}>
                          <span style={{
                            width: 36, height: 36, borderRadius: 8, background: '#f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#94a3b8', fontSize: 14, fontWeight: 700,
                          }}>0</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>No suppliers registered yet</div>
                            <div style={{ fontSize: 12, color: '#888' }}>
                              Be the first to register as a {sub.name} supplier for {industryLabel}
                            </div>
                          </div>
                        </div>

                        {/* ── Action buttons — inline under this process ── */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {/* Executive Summary */}
                          {canSeeExecSummary && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/product-hub/${industryId}/${categoryId}/executive-summary`)
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 14px', borderRadius: 8, border: 'none',
                                background: category.color, color: '#fff',
                                fontWeight: 600, fontSize: 12, cursor: 'pointer',
                              }}
                            >
                              <ChartIcon size={14} />
                              Executive Summary
                            </button>
                          )}

                          {/* Request Quote */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(quoteUrl(sub)) }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 14px', borderRadius: 8,
                              border: `1px solid ${category.color}`, background: '#fff',
                              color: category.color, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            <DocIcon size={14} />
                            Request a Quote
                          </button>

                          {/* Add Supplier */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(addSupplierUrl(sub)) }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 14px', borderRadius: 8,
                              border: '1px solid #e2e8f0', background: '#fff',
                              color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            <PlusIcon size={14} />
                            Add Supplier
                          </button>

                          {/* Register (seller only) */}
                          {isSeller && (
                            <button
                              type="button"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 14px', borderRadius: 8,
                                border: `1px solid ${category.color}40`, background: `${category.color}08`,
                                color: category.color, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                              }}
                            >
                              Register as Supplier
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick Actions (Right) */}
          <div className="industry-hub-card">
            <h2 className="industry-hub-card-title">+ Quick Actions</h2>
            <p className="industry-hub-card-subtitle">Common tasks for product sourcing.</p>
            <div className="industry-hub-actions-list">
              <button type="button" className="industry-hub-action-item" onClick={() => {
                const p = new URLSearchParams({ industry: industryId, industryLabel, productCategory: category.name, context: 'product' })
                navigate(`/equipment-request?${p.toString()}`)
              }}>
                <span className="industry-hub-action-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                Request Product Quote
              </button>
              <button type="button" className="industry-hub-action-item" onClick={() => navigate(`/industry/${industryId}/audit-request`)}>
                <span className="industry-hub-action-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                Request Supplier Audit
              </button>
              <button type="button" className="industry-hub-action-item" onClick={() => {
                const p = new URLSearchParams({ industry: industryId, industryLabel, productCategory: category.name, context: 'product' })
                navigate(`/add-supplier?${p.toString()}`)
              }}>
                <span className="industry-hub-action-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                Add New Supplier
              </button>
              <button type="button" className="industry-hub-action-item" onClick={() => navigate('/services')}>
                <span className="industry-hub-action-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                Request a Service
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
