import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import WorldMap from '../components/WorldMap'
import { 
  getSuppliersByIndustry,
  getSuppliersByIndustryAndCategory,
  getSupplierLocations, 
  getIndustryMetrics,
  matchSuppliersToRfq,
  INDUSTRY_LABELS,
} from '../data/supplierDatabase'
import { getEquipmentCategoriesForIndustry } from '../data/equipmentCategoriesByIndustry'
import { getProductCategoriesForIndustry } from '../data/productCategoriesByIndustry'
import { useAccountRegistry } from '../store/accountRegistry'
import useRfqStore from '../store/rfqStore'
import { useAuthStore } from '../store/authStore'
import { useTier, TIERS } from '../services/featureFlags'
import { supabase, isSupabaseConfigured } from '../config/supabase'
import '../styles/app-page.css'
import './ExecutiveSummary.css'

const ExecutiveSummary = () => {
  const navigate = useNavigate()
  const { industryId, categoryId } = useParams()

  /* ── Plan-based visibility ──────────────────────────────── */
  const isSuperAdmin = useAuthStore((s) => s.role === 'superadmin')
  const isPremium = useTier(TIERS.PREMIUM)
  // Preview sessions (via "Preview Platform" on login page) can see the page but NOT names
  const isPreviewSession = (() => {
    try {
      const exp = localStorage.getItem('strefex-preview-expires')
      return exp && Date.now() < Number(exp)
    } catch { return false }
  })()
  const canSeeNames = (isPremium || isSuperAdmin) && !isPreviewSession

  // Build navigation context — Executive Summary now lives under equipment category
  const goBack = () => navigate(-1)

  // Resolve category label for the page title
  const allCategories = useMemo(() => getEquipmentCategoriesForIndustry(industryId), [industryId])
  const productCategories = useMemo(() => getProductCategoriesForIndustry(industryId), [industryId])
  const categoryObj = categoryId
    ? allCategories.find((c) => c.id === categoryId) || productCategories.find((c) => c.id === categoryId)
    : null
  const categoryLabel = categoryObj ? categoryObj.name : categoryId || ''
  
  const { getRfqsByIndustry, getRfqStats, addRfq, sendRfq, addAttachment, removeAttachment } = useRfqStore()
  
  // State
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [showRfqModal, setShowRfqModal] = useState(false)
  const [selectedForRfq, setSelectedForRfq] = useState(new Set()) // multi-select for RFQ comparison
  const [dbRegisteredSellers, setDbRegisteredSellers] = useState([])
  const [newRfq, setNewRfq] = useState({
    title: '',
    categoryId: categoryId || '',
    requirements: { quantity: 1, maxLeadTime: 90, maxPrice: 110, minRating: 4.0 },
    attachments: [],
  })
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)
  
  // Registered sellers from the persistent account registry
  // If categoryId is present, filter by both industry AND category
  const registeredSellers = useAccountRegistry((s) =>
    categoryId
      ? s.getSellersByCategory(industryId, categoryId)
      : s.getRegisteredSellers(industryId)
  )

  // Database-backed registered suppliers (cross-device/session source of truth)
  useEffect(() => {
    let cancelled = false

    const loadDbSuppliers = async () => {
      if (!isSupabaseConfigured || !industryId) {
        if (!cancelled) setDbRegisteredSellers([])
        return
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name, metadata, companies(name)')
          .not('company_id', 'is', null)

        if (error) throw error

        const mapped = (data || [])
          .filter((profile) => {
            const md = profile?.metadata || {}
            const accountTypes = Array.isArray(md.account_types)
              ? md.account_types
              : [md.account_type].filter(Boolean)
            const isSellerLike = accountTypes.includes('seller') || accountTypes.includes('service_provider')
            if (!isSellerLike) return false

            const industries = Array.isArray(md.industries)
              ? md.industries
              : (md.industry ? [md.industry] : [])
            const categoriesByIndustry = md.categories && typeof md.categories === 'object' ? md.categories : {}
            const inIndustry = industries.includes(industryId)
            const inCategory = !categoryId || (Array.isArray(categoriesByIndustry[industryId]) && categoriesByIndustry[industryId].includes(categoryId))
            return inIndustry && inCategory
          })
          .map((profile) => {
            const md = profile?.metadata || {}
            const categoriesByIndustry = md.categories && typeof md.categories === 'object' ? md.categories : {}
            return {
              id: `db-${profile.id}`,
              name: profile?.companies?.name || profile?.full_name || profile?.email || 'Supplier',
              country: md.country || '—',
              city: md.city || '—',
              coordinates: md.coordinates || null,
              industries: Array.isArray(md.industries) ? md.industries : (md.industry ? [md.industry] : []),
              categories: Object.values(categoriesByIndustry).flat(),
              source: 'registered_db',
              rating: md.rating ?? 0,
              riskLevel: md.riskLevel ?? 50,
              fitLevel: md.fitLevel ?? 50,
              capacityLevel: md.capacityLevel ?? 50,
              certifications: md.certifications || [],
              leadTimeDays: md.leadTimeDays ?? 0,
              deliveryTimeDays: md.deliveryTimeDays ?? 0,
              priceIndex: md.priceIndex ?? 100,
              established: md.established ?? null,
              employees: md.employees ?? null,
              plan: md.plan || null,
              registeredAt: md.registeredAt || null,
            }
          })

        if (!cancelled) setDbRegisteredSellers(mapped)
      } catch {
        if (!cancelled) setDbRegisteredSellers([])
      }
    }

    loadDbSuppliers()
    return () => { cancelled = true }
  }, [industryId, categoryId])

  // Get data — merge static supplier DB with registered sellers
  // Scope to equipment category when available
  const industryLabel = industryId ? INDUSTRY_LABELS[industryId] || industryId : 'All Industries'
  const suppliers = useMemo(() => {
    const staticSuppliers = categoryId
      ? getSuppliersByIndustryAndCategory(industryId, categoryId)
      : getSuppliersByIndustry(industryId)
    // Convert registered sellers to the same shape, avoiding duplicates by company name
    const staticNames = new Set(staticSuppliers.map((s) => s.name.toLowerCase()))
    const fromRegistry = registeredSellers
      .filter((a) => !staticNames.has(a.company.toLowerCase()))
      .map((a) => ({
        id: a.id,
        name: a.company,
        country: a.country || '—',
        city: a.city || '—',
        coordinates: a.coordinates || [0, 0],
        industries: a.industries || [],
        categories: Object.values(a.categories || {}).flat(),
        source: 'registered',
        rating: a.rating ?? 0,
        riskLevel: a.riskLevel ?? 50,
        fitLevel: a.fitLevel ?? 50,
        capacityLevel: a.capacityLevel ?? 50,
        certifications: a.certifications || [],
        leadTimeDays: a.leadTimeDays ?? 0,
        deliveryTimeDays: a.deliveryTimeDays ?? 0,
        priceIndex: a.priceIndex ?? 100,
        established: a.established ?? null,
        employees: a.employees ?? null,
        plan: a.plan,
        registeredAt: a.registeredAt,
      }))
    const namesAfterRegistry = new Set([
      ...staticNames,
      ...fromRegistry.map((s) => (s.name || '').toLowerCase()),
    ])
    const fromDatabase = dbRegisteredSellers.filter((s) => !namesAfterRegistry.has((s.name || '').toLowerCase()))
    return [...staticSuppliers, ...fromRegistry, ...fromDatabase]
  }, [industryId, categoryId, registeredSellers, dbRegisteredSellers])

  const supplierLocations = useMemo(() => {
    const staticLocs = getSupplierLocations(industryId, categoryId)
    const staticIds = new Set(staticLocs.map((l) => l.id))
    const registryAndDb = [...registeredSellers, ...dbRegisteredSellers]
    const regLocs = registryAndDb
      .filter((a) => !staticIds.has(a.id) && a.coordinates)
      .map((a) => ({ id: a.id, name: a.company || a.name || 'Supplier', coordinates: a.coordinates, country: a.country || '—', city: a.city || '—', rating: a.rating ?? 0, riskLevel: a.riskLevel ?? 50, fitLevel: a.fitLevel ?? 50 }))
    const allLocs = [...staticLocs, ...regLocs]
    // Anonymize names on map for non-premium buyers
    if (!canSeeNames) {
      return allLocs.map((loc, i) => ({ ...loc, name: `Supplier #${(i + 1).toString().padStart(2, '0')}` }))
    }
    return allLocs
  }, [industryId, categoryId, registeredSellers, dbRegisteredSellers, canSeeNames])

  const metrics = useMemo(() => getIndustryMetrics(industryId, categoryId), [industryId, categoryId])
  const categories = allCategories
  const rfqs = useMemo(() => getRfqsByIndustry(industryId), [industryId, getRfqsByIndustry])
  const rfqStats = useMemo(() => getRfqStats(industryId), [industryId, getRfqStats])
  
  // Matched suppliers for new RFQ
  const matchedSuppliers = useMemo(() => {
    if (!newRfq.categoryId) return suppliers
    return matchSuppliersToRfq({
      industryId,
      categoryId: newRfq.categoryId,
      requirements: newRfq.requirements,
    })
  }, [newRfq.categoryId, newRfq.requirements, industryId, suppliers])
  
  /* ── Anonymized display name for non-premium buyers ────── */
  const getDisplayName = (supplier, index) => {
    if (canSeeNames) return supplier.name
    return `Supplier #${(index + 1).toString().padStart(2, '0')}`
  }

  /* ── Multi-select RFQ toggle ─────────────────────────────── */
  const toggleRfqSelection = (supplierId) => {
    setSelectedForRfq((prev) => {
      const next = new Set(prev)
      if (next.has(supplierId)) next.delete(supplierId)
      else next.add(supplierId)
      return next
    })
  }

  const handleSendMultiRfq = () => {
    if (selectedForRfq.size === 0) return
    setShowRfqModal(true)
  }

  // Handle marker click on map
  const handleMarkerClick = (location) => {
    const supplier = suppliers.find(s => s.id === location.id)
    setSelectedSupplier(supplier)
  }
  
  // Handle file attachment
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    const newAttachments = files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }))
    setAttachments([...attachments, ...newAttachments])
    e.target.value = ''
  }
  
  const handleRemoveAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }
  
  // Handle RFQ creation — includes manually selected suppliers when multi-selecting
  const handleCreateRfq = () => {
    const targetSupplierIds = selectedForRfq.size > 0
      ? Array.from(selectedForRfq)
      : matchedSuppliers.slice(0, 5).map(s => s.id)
    const rfq = {
      ...newRfq,
      industryId,
      suppliers: targetSupplierIds,
      attachments: attachments.map(a => a.name),
    }
    addRfq(rfq)
    setShowRfqModal(false)
    setSelectedForRfq(new Set())
    setNewRfq({
      title: '',
      categoryId: '',
      requirements: { quantity: 1, maxLeadTime: 90, maxPrice: 110, minRating: 4.0 },
      attachments: [],
    })
    setAttachments([])
  }
  
  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
  
  // Get risk color
  const getRiskColor = (risk) => {
    if (risk <= 10) return '#4CAF50'
    if (risk <= 20) return '#FF9800'
    return '#f44336'
  }
  
  // Get rating color
  const getRatingColor = (rating) => {
    if (rating >= 4.5) return '#4CAF50'
    if (rating >= 4.0) return '#FF9800'
    return '#f44336'
  }

  return (
    <AppLayout>
      <div className="app-page executive-summary-page">
        {/* Header Card */}
        <div className="app-page-card">
          <a className="app-page-back-link" href="#" onClick={(e) => { e.preventDefault(); goBack() }}>
            ← Back
          </a>
          <div className="exec-header">
            <div className="exec-header-left">
              <div className="exec-logo-container">
                <img src="/assets/strefex-logo.png" alt="STREFEX" className="exec-logo-img" />
              </div>
              <p className="exec-subtitle">EXECUTIVE SUMMARY</p>
              <p className="app-page-subtitle">
                {industryLabel}{categoryLabel ? ` — ${categoryLabel}` : ''} — Supplier Metrics & RFQ Analysis
              </p>
            </div>
            <button 
              type="button" 
              className="exec-rfq-btn"
              onClick={() => setShowRfqModal(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Create RFQ
            </button>
          </div>
        </div>

        {/* Main Indicators - Fit, Risk, Capacity */}
        <div className="exec-main-indicators">
          <div className="exec-indicator-card">
            <span className="exec-indicator-label">SUPPLIER FIT LEVEL</span>
            <div className="exec-indicator-bar">
              <div 
                className="exec-indicator-fill fit"
                style={{ width: `${metrics.avgFit}%` }}
              />
            </div>
            <span className="exec-indicator-value">{metrics.avgFit}%</span>
          </div>
          <div className="exec-indicator-card">
            <span className="exec-indicator-label">RISK LEVEL</span>
            <div className="exec-indicator-bar">
              <div 
                className="exec-indicator-fill risk"
                style={{ width: `${metrics.avgRisk}%` }}
              />
            </div>
            <span className="exec-indicator-value">{metrics.avgRisk}%</span>
          </div>
          <div className="exec-indicator-card">
            <span className="exec-indicator-label">CAPACITY LEVEL</span>
            <div className="exec-indicator-bar">
              <div 
                className="exec-indicator-fill capacity"
                style={{ width: `${metrics.avgCapacity}%` }}
              />
            </div>
            <span className="exec-indicator-value">{metrics.avgCapacity}%</span>
          </div>
        </div>

        {/* Map and RFQ Stats Row */}
        <div className="exec-content-row">
          {/* Map Section */}
          <div className="app-page-card exec-map-card">
            <h3 className="exec-section-title">Supplier Locations</h3>
            <div className="exec-map-container">
              <WorldMap 
                locations={supplierLocations}
                onMarkerClick={handleMarkerClick}
                selectedId={selectedSupplier?.id}
                markerColor="#4CAF50"
                selectedMarkerColor="#2196F3"
              />
            </div>
            <div className="exec-map-legend">
              <span className="legend-item">
                <span className="legend-dot green" /> High Rating (≥4.5)
              </span>
              <span className="legend-item">
                <span className="legend-dot orange" /> Medium Rating (4.0-4.5)
              </span>
              <span className="legend-item">
                <span className="legend-dot red" /> Low Rating (&lt;4.0)
              </span>
            </div>
          </div>

          {/* RFQ Infographics */}
          <div className="exec-rfq-stats">
            <div className="app-page-card exec-stat-card">
              <div className="exec-stat-icon sent">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="exec-stat-info">
                <span className="exec-stat-value">{rfqStats.sent}</span>
                <span className="exec-stat-label">RFQs Sent</span>
              </div>
            </div>
            <div className="app-page-card exec-stat-card">
              <div className="exec-stat-icon active">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="exec-stat-info">
                <span className="exec-stat-value">{rfqStats.active}</span>
                <span className="exec-stat-label">Active RFQs</span>
              </div>
            </div>
            <div className="app-page-card exec-stat-card">
              <div className="exec-stat-icon responses">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="exec-stat-info">
                <span className="exec-stat-value">{rfqStats.responses}</span>
                <span className="exec-stat-label">Responses</span>
              </div>
            </div>
            <div className="app-page-card exec-stat-card">
              <div className="exec-stat-icon suppliers">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="exec-stat-info">
                <span className="exec-stat-value">{metrics.totalSuppliers}</span>
                <span className="exec-stat-label">Matched Suppliers</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Upgrade banner for non-premium buyers ─────────── */}
        {!canSeeNames && (
          <div className="exec-upgrade-banner">
            <div className="exec-upgrade-banner-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="exec-upgrade-banner-text">
              <strong>Supplier names are hidden.</strong> Upgrade to <span className="exec-highlight-premium">Premium</span> to reveal supplier identities. You can still compare all metrics and send RFQs to multiple sellers for price comparison.
            </div>
            <button type="button" className="exec-upgrade-btn" onClick={() => navigate('/plans')}>
              Upgrade Plan
            </button>
          </div>
        )}

        {/* Supplier Summary Table */}
        <div className="app-page-card">
          <div className="exec-table-header-row">
            <h3 className="exec-section-title">Registered Sellers &amp; Suppliers ({suppliers.length})</h3>
            {selectedForRfq.size > 0 && (
              <button type="button" className="exec-multi-rfq-btn" onClick={handleSendMultiRfq}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Send RFQ to {selectedForRfq.size} Seller{selectedForRfq.size > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="exec-table-wrapper">
            <table className="exec-table">
              <thead>
                <tr>
                  <th className="exec-th-check">
                    <input
                      type="checkbox"
                      checked={selectedForRfq.size === suppliers.length && suppliers.length > 0}
                      onChange={() => {
                        if (selectedForRfq.size === suppliers.length) setSelectedForRfq(new Set())
                        else setSelectedForRfq(new Set(suppliers.map(s => s.id)))
                      }}
                      title="Select all for RFQ"
                    />
                  </th>
                  <th>Supplier</th>
                  <th>Location</th>
                  <th>Rating</th>
                  <th>Risk</th>
                  <th>Fit</th>
                  <th>Capacity</th>
                  <th>Lead Time</th>
                  <th>Delivery</th>
                  <th>Price Index</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier, idx) => (
                  <tr 
                    key={supplier.id}
                    className={`${selectedSupplier?.id === supplier.id ? 'selected' : ''} ${selectedForRfq.has(supplier.id) ? 'rfq-checked' : ''}`}
                    onClick={() => setSelectedSupplier(supplier)}
                  >
                    <td className="exec-td-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedForRfq.has(supplier.id)}
                        onChange={() => toggleRfqSelection(supplier.id)}
                        title="Select for RFQ comparison"
                      />
                    </td>
                    <td className="supplier-name">
                      <span className="supplier-name-text">
                        {getDisplayName(supplier, idx)}
                        {canSeeNames && supplier.source === 'registered' && <span className="exec-reg-badge">Registered</span>}
                        {!canSeeNames && <span className="exec-anon-badge">Anonymous</span>}
                      </span>
                      {canSeeNames && (
                        <span className="supplier-certs">
                          {supplier.certifications?.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="location-cell">
                        <span className="country-flag">{supplier.country}</span>
                        <span className="city-name">{supplier.city}</span>
                      </span>
                    </td>
                    <td>
                      <span className="rating-cell" style={{ color: getRatingColor(supplier.rating) }}>
                        {supplier.rating} ★
                      </span>
                    </td>
                    <td>
                      <span className="risk-cell">
                        <span 
                          className="risk-bar"
                          style={{ 
                            width: `${supplier.riskLevel}%`,
                            backgroundColor: getRiskColor(supplier.riskLevel)
                          }}
                        />
                        <span className="risk-value">{supplier.riskLevel}%</span>
                      </span>
                    </td>
                    <td>
                      <span className="fit-cell">
                        <span 
                          className="fit-bar"
                          style={{ width: `${supplier.fitLevel}%` }}
                        />
                        <span className="fit-value">{supplier.fitLevel}%</span>
                      </span>
                    </td>
                    <td>
                      <span className="capacity-cell">
                        <span 
                          className="capacity-bar"
                          style={{ width: `${supplier.capacityLevel}%` }}
                        />
                        <span className="capacity-value">{supplier.capacityLevel}%</span>
                      </span>
                    </td>
                    <td className="time-cell">{supplier.leadTimeDays} days</td>
                    <td className="time-cell">{supplier.deliveryTimeDays} days</td>
                    <td>
                      <span 
                        className="price-cell"
                        style={{ 
                          color: supplier.priceIndex <= 100 ? '#4CAF50' : 
                                 supplier.priceIndex <= 110 ? '#FF9800' : '#f44336'
                        }}
                      >
                        {supplier.priceIndex}
                      </span>
                    </td>
                    <td>
                      <button 
                        type="button" 
                        className="table-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSupplier(supplier)
                          setShowRfqModal(true)
                        }}
                      >
                        RFQ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Supplier Details */}
        {selectedSupplier && (
          <div className="app-page-card exec-supplier-detail">
            <div className="exec-detail-header">
              <h3 className="exec-section-title">
                {canSeeNames ? selectedSupplier.name : getDisplayName(selectedSupplier, suppliers.indexOf(selectedSupplier))}
              </h3>
              <div className="exec-detail-header-actions">
                {!selectedForRfq.has(selectedSupplier.id) && (
                  <button
                    type="button"
                    className="table-action-btn"
                    onClick={() => toggleRfqSelection(selectedSupplier.id)}
                  >
                    + Add to RFQ
                  </button>
                )}
                <button 
                  type="button" 
                  className="close-btn"
                  onClick={() => setSelectedSupplier(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="exec-detail-grid">
              <div className="exec-detail-item">
                <span className="detail-label">Location</span>
                <span className="detail-value">{selectedSupplier.city}, {selectedSupplier.country}</span>
              </div>
              {canSeeNames && (
                <div className="exec-detail-item">
                  <span className="detail-label">Established</span>
                  <span className="detail-value">{selectedSupplier.established}</span>
                </div>
              )}
              {canSeeNames && (
                <div className="exec-detail-item">
                  <span className="detail-label">Employees</span>
                  <span className="detail-value">{selectedSupplier.employees?.toLocaleString()}</span>
                </div>
              )}
              <div className="exec-detail-item">
                <span className="detail-label">Certifications</span>
                <span className="detail-value">{selectedSupplier.certifications?.join(', ')}</span>
              </div>
              <div className="exec-detail-item">
                <span className="detail-label">Industries</span>
                <span className="detail-value">
                  {selectedSupplier.industries?.map(i => INDUSTRY_LABELS[i] || i).join(', ')}
                </span>
              </div>
              <div className="exec-detail-item">
                <span className="detail-label">Categories</span>
                <span className="detail-value">{selectedSupplier.categories?.join(', ')}</span>
              </div>
            </div>
            <div className="exec-detail-metrics">
              <div className="metric-item">
                <div className="metric-gauge">
                  <svg viewBox="0 0 100 50">
                    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#e0e0e0" strokeWidth="8"/>
                    <path 
                      d="M10 50 A40 40 0 0 1 90 50" 
                      fill="none" 
                      stroke="#4CAF50" 
                      strokeWidth="8"
                      strokeDasharray={`${selectedSupplier.fitLevel * 1.26} 126`}
                    />
                  </svg>
                  <span className="metric-value">{selectedSupplier.fitLevel}%</span>
                </div>
                <span className="metric-label">Fit Level</span>
              </div>
              <div className="metric-item">
                <div className="metric-gauge">
                  <svg viewBox="0 0 100 50">
                    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#e0e0e0" strokeWidth="8"/>
                    <path 
                      d="M10 50 A40 40 0 0 1 90 50" 
                      fill="none" 
                      stroke={getRiskColor(selectedSupplier.riskLevel)} 
                      strokeWidth="8"
                      strokeDasharray={`${selectedSupplier.riskLevel * 1.26} 126`}
                    />
                  </svg>
                  <span className="metric-value">{selectedSupplier.riskLevel}%</span>
                </div>
                <span className="metric-label">Risk Level</span>
              </div>
              <div className="metric-item">
                <div className="metric-gauge">
                  <svg viewBox="0 0 100 50">
                    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#e0e0e0" strokeWidth="8"/>
                    <path 
                      d="M10 50 A40 40 0 0 1 90 50" 
                      fill="none" 
                      stroke="#FF9800" 
                      strokeWidth="8"
                      strokeDasharray={`${selectedSupplier.capacityLevel * 1.26} 126`}
                    />
                  </svg>
                  <span className="metric-value">{selectedSupplier.capacityLevel}%</span>
                </div>
                <span className="metric-label">Capacity</span>
              </div>
            </div>
          </div>
        )}

        {/* RFQ Modal */}
        {showRfqModal && (
          <div className="exec-modal-overlay" onClick={() => setShowRfqModal(false)}>
            <div className="exec-modal" onClick={e => e.stopPropagation()}>
              <div className="exec-modal-header">
                <h3>Create New RFQ</h3>
                <button type="button" className="close-btn" onClick={() => setShowRfqModal(false)}>×</button>
              </div>
              <div className="exec-modal-body">
                <div className="exec-form-group">
                  <label>RFQ Title</label>
                  <input 
                    type="text"
                    value={newRfq.title}
                    onChange={e => setNewRfq({ ...newRfq, title: e.target.value })}
                    placeholder="Enter RFQ title..."
                  />
                </div>
                <div className="exec-form-group">
                  <label>Equipment Category</label>
                  <select 
                    value={newRfq.categoryId}
                    onChange={e => setNewRfq({ ...newRfq, categoryId: e.target.value })}
                  >
                    <option value="">Select category...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="exec-form-row">
                  <div className="exec-form-group">
                    <label>Quantity</label>
                    <input 
                      type="number"
                      min="1"
                      value={newRfq.requirements.quantity}
                      onChange={e => setNewRfq({
                        ...newRfq,
                        requirements: { ...newRfq.requirements, quantity: parseInt(e.target.value) || 1 }
                      })}
                    />
                  </div>
                  <div className="exec-form-group">
                    <label>Max Lead Time (days)</label>
                    <input 
                      type="number"
                      min="1"
                      value={newRfq.requirements.maxLeadTime}
                      onChange={e => setNewRfq({
                        ...newRfq,
                        requirements: { ...newRfq.requirements, maxLeadTime: parseInt(e.target.value) || 90 }
                      })}
                    />
                  </div>
                </div>
                <div className="exec-form-row">
                  <div className="exec-form-group">
                    <label>Max Price Index</label>
                    <input 
                      type="number"
                      min="50"
                      max="200"
                      value={newRfq.requirements.maxPrice}
                      onChange={e => setNewRfq({
                        ...newRfq,
                        requirements: { ...newRfq.requirements, maxPrice: parseInt(e.target.value) || 110 }
                      })}
                    />
                  </div>
                  <div className="exec-form-group">
                    <label>Min Rating</label>
                    <input 
                      type="number"
                      min="1"
                      max="5"
                      step="0.1"
                      value={newRfq.requirements.minRating}
                      onChange={e => setNewRfq({
                        ...newRfq,
                        requirements: { ...newRfq.requirements, minRating: parseFloat(e.target.value) || 4.0 }
                      })}
                    />
                  </div>
                </div>
                
                {/* File Attachments */}
                <div className="exec-form-group">
                  <label>Attachments</label>
                  <div className="exec-attachments">
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      multiple
                      style={{ display: 'none' }}
                    />
                    <button 
                      type="button"
                      className="exec-attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Attach Files
                    </button>
                    {attachments.length > 0 && (
                      <div className="exec-attachment-list">
                        {attachments.map((file, index) => (
                          <div key={index} className="exec-attachment-item">
                            <span className="attachment-name">{file.name}</span>
                            <span className="attachment-size">{formatFileSize(file.size)}</span>
                            <button 
                              type="button"
                              className="attachment-remove"
                              onClick={() => handleRemoveAttachment(index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Matched / Selected Suppliers Preview */}
                <div className="exec-form-group">
                  <label>
                    {selectedForRfq.size > 0
                      ? `Selected Suppliers (${selectedForRfq.size})`
                      : `Matched Suppliers (${matchedSuppliers.length})`
                    }
                  </label>
                  <div className="exec-matched-suppliers">
                    {(selectedForRfq.size > 0
                      ? suppliers.filter(s => selectedForRfq.has(s.id))
                      : matchedSuppliers.slice(0, 5)
                    ).map((supplier, idx) => (
                      <div key={supplier.id} className="exec-matched-item">
                        <span className="matched-name">
                          {canSeeNames ? supplier.name : getDisplayName(supplier, suppliers.indexOf(supplier))}
                        </span>
                        <span className="matched-score">{supplier.matchScore || supplier.fitLevel}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="exec-modal-footer">
                <button 
                  type="button"
                  className="exec-btn-secondary"
                  onClick={() => setShowRfqModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  className="exec-btn-primary"
                  onClick={handleCreateRfq}
                  disabled={!newRfq.title}
                >
                  Send RFQ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default ExecutiveSummary
