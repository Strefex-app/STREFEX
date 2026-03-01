import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useAuthStore } from '../store/authStore'
import { useSupplierStore } from '../store/supplierStore'
import { useAccountRegistry } from '../store/accountRegistry'
import { useIndustryStore } from '../store/industryStore'
import { getProductCategoriesForIndustry } from '../data/productCategoriesByIndustry'
import { getEquipmentCategoriesForIndustry } from '../data/equipmentCategoriesByIndustry'
import '../styles/app-page.css'
import './AddSupplier.css'

/** Map industry query-param IDs to the checkbox labels used in the form */
const INDUSTRY_ID_TO_LABEL = {
  automotive: 'Automotive',
  machinery: 'Machinery',
  electronics: 'Electronics',
  medical: 'Medical',
  'raw-materials': 'Raw Materials',
  'oil-gas': 'Oil & Gas',
  'green-energy': 'Green Energy',
  'household-products': 'Household Products',
}

const INDUSTRY_LABEL_TO_ID = Object.fromEntries(
  Object.entries(INDUSTRY_ID_TO_LABEL).map(([id, label]) => [label.toLowerCase(), id])
)

const AddSupplier = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const addSubmission = useSupplierStore((state) => state.addSubmission)
  const registerAccount = useAccountRegistry((state) => state.registerAccount)
  const getAccountByEmail = useAccountRegistry((state) => state.getAccountByEmail)
  const updateAccount = useAccountRegistry((state) => state.updateAccount)
  const selectIndustry = useIndustryStore((state) => state.selectIndustry)
  const selectCategory = useIndustryStore((state) => state.selectCategory)
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)

  // ── Context from query params ──
  const contextType = searchParams.get('context') || ''
  const isProductContext = contextType === 'product'
  const isServiceContext = contextType === 'service'
  const isEquipmentContext = contextType === 'equipment'
  const hasContext = isProductContext || isServiceContext || isEquipmentContext

  // Product params
  const qIndustry = searchParams.get('industry') || ''
  const qIndustryLabel = searchParams.get('industryLabel') || ''
  const qProductCategory = searchParams.get('productCategory') || ''
  const qProcess = searchParams.get('process') || ''
  const qCategory = searchParams.get('category') || ''
  const qCategoryId = searchParams.get('categoryId') || ''

  // Service params
  const qServiceCategory = searchParams.get('serviceCategory') || ''
  const qServiceCategoryLabel = searchParams.get('serviceCategoryLabel') || ''

  /** Map service category IDs to industry checkbox labels */
  const SERVICE_CATEGORY_TO_INDUSTRIES = {
    'project-management': [],
    'supplier-services': [],
    'quality-services': [],
  }

  // Pre-select the matching industry checkbox
  const preselectedIndustries = (() => {
    if (isProductContext) {
      const label = INDUSTRY_ID_TO_LABEL[qIndustry]
      return label ? [label] : []
    }
    if (isServiceContext) {
      return SERVICE_CATEGORY_TO_INDUSTRIES[qServiceCategory] || []
    }
    if (isEquipmentContext) {
      const label = INDUSTRY_ID_TO_LABEL[qIndustry]
      return label ? [label] : []
    }
    return []
  })()

  // Build a pre-filled description based on context
  const prefillDescription = (() => {
    if (isProductContext) {
      return `Supplier for ${qProductCategory}${qProcess ? ` — ${qProcess}` : ''} (${qIndustryLabel || qIndustry} industry)`
    }
    if (isServiceContext) {
      return `Service supplier for ${qServiceCategoryLabel || qServiceCategory}`
    }
    if (isEquipmentContext) {
      return `Supplier for ${qCategory || 'equipment'} (${qIndustryLabel || qIndustry} industry)`
    }
    return ''
  })()

  const [formData, setFormData] = useState({
    companyName: tenant?.name || user?.companyName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    website: '',
    contactPerson: user?.fullName || user?.name || '',
    industries: preselectedIndustries,
    otherIndustry: '',
    description: prefillDescription,
    certifications: [],
    country: '',
    city: '',
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const industryOptions = [
    'Automotive',
    'Machinery',
    'Electronics',
    'Medical',
    'Automation',
    'Robotics',
    'Plastic Manufacturing',
    'Metal Parts Manufacturing',
    'Mold Making',
    'Raw Materials',
    'Logistics',
    'Others'
  ]

  const certificationOptions = [
    'ISO 9001',
    'ISO 14001',
    'IATF 16949',
    'ISO 13485',
    'CE Marking',
    'FDA Approved',
    'UL Listed',
    'Other'
  ]

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleIndustryChange = (industry) => {
    setFormData(prev => {
      const industries = prev.industries.includes(industry)
        ? prev.industries.filter(i => i !== industry)
        : [...prev.industries, industry]
      
      const otherIndustry = industries.includes('Others') ? prev.otherIndustry : ''
      
      return {
        ...prev,
        industries,
        otherIndustry
      }
    })
  }

  const handleCertificationChange = (cert) => {
    setFormData(prev => {
      const certifications = prev.certifications.includes(cert)
        ? prev.certifications.filter(c => c !== cert)
        : [...prev.certifications, cert]
      
      return {
        ...prev,
        certifications
      }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // 1) Keep admin approval queue behavior
      addSubmission(formData)

      // 2) Register supplier in the same registry used by executive summary
      const fromFormIndustryIds = (formData.industries || [])
        .map((label) => INDUSTRY_LABEL_TO_ID[label.toLowerCase()])
        .filter(Boolean)
      const industryIds = [...new Set([
        ...fromFormIndustryIds,
        ...(qIndustry ? [qIndustry] : []),
      ])]

      // Resolve product category ID (if route came from product context)
      let resolvedCategoryId = null
      if (isProductContext && qIndustry && qProductCategory) {
        const productCategories = getProductCategoriesForIndustry(qIndustry)
        const found = productCategories.find((c) => c.name.toLowerCase() === qProductCategory.toLowerCase())
        resolvedCategoryId = found?.id || null
      }
      if (isEquipmentContext && qIndustry) {
        if (qCategoryId) {
          resolvedCategoryId = qCategoryId
        } else if (qCategory) {
          const equipmentCategories = getEquipmentCategoriesForIndustry(qIndustry)
          const found = equipmentCategories.find((c) => c.name.toLowerCase() === qCategory.toLowerCase())
          resolvedCategoryId = found?.id || null
        }
      }

      const categories = {}
      industryIds.forEach((industryId) => {
        categories[industryId] = resolvedCategoryId ? [resolvedCategoryId] : []
      })

      const emailKey = (formData.email || '').trim().toLowerCase()
      const nowIso = new Date().toISOString()
      const existing = getAccountByEmail(emailKey)
      const accountPayload = {
        company: formData.companyName?.trim() || tenant?.name || 'Supplier',
        email: emailKey,
        contactName: formData.contactPerson?.trim() || '',
        accountType: 'seller',
        status: 'active',
        plan: 'start',
        industries: industryIds,
        categories,
        country: formData.country?.trim() || '',
        city: formData.city?.trim() || '',
        rating: 0,
        riskLevel: 50,
        fitLevel: 50,
        capacityLevel: 50,
        certifications: formData.certifications || [],
        leadTimeDays: 0,
        deliveryTimeDays: 0,
        priceIndex: 100,
        registeredAt: existing?.registeredAt || nowIso,
      }

      if (existing) {
        updateAccount(emailKey, accountPayload)
      } else {
        registerAccount({
          id: `supp-${Date.now()}`,
          ...accountPayload,
        })
      }

      // 3) Mirror to current logged-in supplier profile flow (industry/category selection)
      // if this submission is for the signed-in account and route context includes industry/category.
      if (user?.email && user.email.toLowerCase() === emailKey) {
        industryIds.forEach((industryId) => selectIndustry(industryId, Infinity))
        if (qIndustry && resolvedCategoryId) {
          selectCategory(qIndustry, resolvedCategoryId, Infinity)
        }
      }

      setTimeout(() => {
        setIsSubmitting(false)
        setIsSubmitted(true)
      }, 400)
    } catch {
      setIsSubmitting(false)
      alert('Could not register supplier. Please try again.')
    }
  }

  if (isSubmitted) {
    return (
      <AppLayout>
        <div className="app-page add-supplier-page">
          <div className="app-page-card success-card">
            <div className="success-content">
              <div className="success-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="success-title">Submitted Successfully!</h2>
              <p className="success-description">
                Your supplier onboarding request has been submitted. Our team will review your application and get back to you within 2-3 business days.
              </p>
              <div className="success-actions">
                <button 
                  type="button"
                  className="success-btn primary"
                  onClick={() => navigate('/profile')}
                >
                  Back to Profile
                </button>
                <button 
                  type="button"
                  className="success-btn secondary"
                  onClick={() => {
                    setIsSubmitted(false)
                    setFormData({
                      companyName: '',
                      email: '',
                      phone: '',
                      address: '',
                      website: '',
                      contactPerson: '',
                      industries: [],
                      otherIndustry: '',
                      description: '',
                      certifications: [],
                      country: '',
                      city: '',
                    })
                  }}
                >
                  Add Another Supplier
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="app-page add-supplier-page">
        {/* Header Card */}
        <div className="app-page-card">
          <a 
            className="app-page-back-link" 
            href="/profile" 
            onClick={(e) => { e.preventDefault(); navigate(-1) }}
          >
            ← Back
          </a>
          <h2 className="app-page-title">
            {isProductContext
              ? 'Register Supplier for Product / Manufacturing'
              : isServiceContext
                ? `Register Supplier for ${qServiceCategoryLabel || 'Service'}`
                : 'Add New Supplier'}
          </h2>
          <p className="app-page-subtitle">
            {isProductContext
              ? 'Submit a supplier specializing in the selected manufacturing process. Industry and product details are pre-filled below.'
              : isServiceContext
                ? `Submit a supplier specializing in ${qServiceCategoryLabel}. Service details are pre-filled below.`
                : 'Submit a new supplier for review and approval.'}
          </p>
        </div>

        {/* ── Product context info banner ── */}
        {isProductContext && (
          <div className="app-page-card" style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
            border: '1px solid #bfdbfe',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e40af' }}>
              Pre-selected Product Information
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{
                flex: '1 1 200px', padding: '10px 14px', borderRadius: 8,
                background: '#fff', border: '1px solid #dbeafe',
              }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Industry</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{qIndustryLabel || qIndustry}</div>
              </div>
              <div style={{
                flex: '1 1 200px', padding: '10px 14px', borderRadius: 8,
                background: '#fff', border: '1px solid #dbeafe',
              }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Product Category</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{qProductCategory}</div>
              </div>
              {qProcess && (
                <div style={{
                  flex: '1 1 200px', padding: '10px 14px', borderRadius: 8,
                  background: '#fff', border: '1px solid #dbeafe',
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Manufacturing Process</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{qProcess}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Service context info banner ── */}
        {isServiceContext && (
          <div className="app-page-card" style={{
            background: 'linear-gradient(135deg, #fff3e0 0%, #fef9f0 100%)',
            border: '1px solid #ffcc80',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#e65100' }}>
              Pre-selected Service Information
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{
                flex: '1 1 280px', padding: '10px 14px', borderRadius: 8,
                background: '#fff', border: '1px solid #ffe0b2',
              }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Service Category</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{qServiceCategoryLabel}</div>
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#78909c' }}>
              The company description has been pre-filled with the service context. You can adjust it as needed.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Company Information */}
          <div className="app-page-card">
            <h3 className="form-section-title">
              <span className="section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              Company Information
            </h3>
            
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="companyName">
                  Company Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="companyName"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter company name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="website">
                  Website
                </label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="country">
                  Country <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="country"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter country"
                />
              </div>

              <div className="form-group">
                <label htmlFor="city">
                  City <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter city"
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="address">
                  Full Address <span className="required">*</span>
                </label>
                <textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter full company address"
                  rows="2"
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="description">
                  Company Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Brief description of the company and its products/services"
                  rows="3"
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="app-page-card">
            <h3 className="form-section-title">
              <span className="section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </span>
              Contact Information
            </h3>
            
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="contactPerson">
                  Contact Person <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="contactPerson"
                  name="contactPerson"
                  value={formData.contactPerson}
                  onChange={handleInputChange}
                  required
                  placeholder="Full name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">
                  Email Address <span className="required">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  placeholder="contact@company.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">
                  Phone Number <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Industries */}
          <div className="app-page-card">
            <h3 className="form-section-title">
              <span className="section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M2 20h20M4 20V10l8-6 8 6v10M9 20v-6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              Related Industries <span className="required">*</span>
            </h3>
            <p className="form-hint">Select all applicable industries</p>
            
            <div className="checkbox-grid">
              {industryOptions.map((industry) => (
                <label key={industry} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.industries.includes(industry)}
                    onChange={() => handleIndustryChange(industry)}
                  />
                  <span className="checkbox-box">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span className="checkbox-label">{industry}</span>
                </label>
              ))}
            </div>

            {formData.industries.includes('Others') && (
              <div className="form-group" style={{ marginTop: '16px', maxWidth: '400px' }}>
                <label htmlFor="otherIndustry">
                  Please specify <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="otherIndustry"
                  name="otherIndustry"
                  value={formData.otherIndustry}
                  onChange={handleInputChange}
                  required={formData.industries.includes('Others')}
                  placeholder="Specify the industry"
                />
              </div>
            )}
          </div>

          {/* Certifications */}
          <div className="app-page-card">
            <h3 className="form-section-title">
              <span className="section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15l-2 5-1-3-3 1 2-5M12 15l2 5 1-3 3 1-2-5M12 15V8M8.21 13.89L7 23l5-3 5 3-1.21-9.11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="8" r="6" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </span>
              Certifications
            </h3>
            <p className="form-hint">Select all certifications the supplier holds</p>
            
            <div className="checkbox-grid">
              {certificationOptions.map((cert) => (
                <label key={cert} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.certifications.includes(cert)}
                    onChange={() => handleCertificationChange(cert)}
                  />
                  <span className="checkbox-box">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span className="checkbox-label">{cert}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="app-page-card form-actions-card">
            <div className="form-actions">
              <button 
                type="button"
                className="btn-secondary"
                onClick={() => navigate('/profile')}
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="btn-primary"
                disabled={formData.industries.length === 0 || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Submit for Review
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}

export default AddSupplier
