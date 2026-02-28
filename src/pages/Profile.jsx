import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
/* tesseract.js loaded dynamically only when OCR is triggered */
import { useAuthStore } from '../store/authStore'
import { useSubscriptionStore, useTier, TIERS } from '../services/featureFlags'
import { getPlanById, getEffectiveLimits } from '../services/stripeService'
import { useTranslation } from '../i18n/useTranslation'
import { tenantKey } from '../utils/tenantStorage'
import AppLayout from '../components/AppLayout'
import '../styles/app-page.css'
import './Profile.css'

/* ── Business-card OCR parser ───────────────────────────────── */
const parseBusinessCard = (rawText) => {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
  const result = { name: '', company: '', title: '', email: '', phone: '', address: '', website: '', industry: '', type: 'Supplier', notes: '' }

  // Email
  const emailRx = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/
  // Phone (international & local patterns)
  const phoneRx = /(?:\+?\d{1,4}[\s\-.]?)?\(?\d{1,5}\)?[\s\-.]?\d{1,5}[\s\-.]?\d{2,10}/
  // Website
  const webRx = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/\S*)?/i
  // Common job titles
  const titleKw = /\b(manager|director|engineer|ceo|cfo|cto|coo|president|vp|vice\s*president|head|chief|lead|supervisor|coordinator|specialist|consultant|analyst|officer|founder|partner|sales|marketing|purchasing|procurement|quality|production|operations|logistics|account|executive|representative|assistant|secretary|admin|technician|senior|junior|intern)\b/i
  // Industry keywords
  const industryMap = {
    automotive: 'Automotive', auto: 'Automotive', car: 'Automotive', vehicle: 'Automotive',
    machinery: 'Machinery', machine: 'Machinery', cnc: 'Machinery', tooling: 'Machinery',
    electronic: 'Electronics', semiconductor: 'Electronics', pcb: 'Electronics',
    medical: 'Medical', pharma: 'Medical', healthcare: 'Medical', hospital: 'Medical',
    plastic: 'Plastic', polymer: 'Plastic', injection: 'Plastic', mold: 'Plastic', mould: 'Plastic',
    metal: 'Metal', steel: 'Metal', aluminum: 'Metal', aluminium: 'Metal', casting: 'Metal', forge: 'Metal',
    chemical: 'Chemical', rubber: 'Chemical',
    aerospace: 'Aerospace', aviation: 'Aerospace',
    energy: 'Energy', solar: 'Energy', power: 'Energy', oil: 'Energy', gas: 'Energy',
  }
  // Address indicators
  const addrKw = /\b(street|st\.|avenue|ave\.|boulevard|blvd|road|rd\.|drive|dr\.|suite|ste|floor|building|bldg|city|state|zip|postal|p\.?o\.?\s*box|district)\b/i
  const addrNumRx = /\d{3,}.*(?:street|st|ave|blvd|road|rd|drive|dr|suite|floor|building)/i

  const used = new Set()

  // Pass 1: extract structured fields
  lines.forEach((line, i) => {
    const lo = line.toLowerCase()
    if (!result.email && emailRx.test(line)) { result.email = line.match(emailRx)[0]; used.add(i) }
    if (!result.phone && phoneRx.test(line) && !emailRx.test(line) && !webRx.test(line)) {
      const m = line.match(phoneRx)
      if (m && m[0].replace(/\D/g, '').length >= 7) { result.phone = m[0].trim(); used.add(i) }
    }
    if (!result.website && webRx.test(line) && !emailRx.test(line)) {
      const w = line.match(webRx)[0]
      if (!w.includes('@')) { result.website = w; used.add(i) }
    }
    if (!result.address && (addrKw.test(lo) || addrNumRx.test(lo))) { result.address = line; used.add(i) }
    for (const [kw, ind] of Object.entries(industryMap)) {
      if (lo.includes(kw)) { result.industry = ind; break }
    }
  })

  // Derive website from email domain if not found
  if (!result.website && result.email) {
    const domain = result.email.split('@')[1]
    if (domain && !domain.includes('gmail') && !domain.includes('yahoo') && !domain.includes('hotmail') && !domain.includes('outlook')) {
      result.website = 'www.' + domain
    }
  }

  // Pass 2: heuristic for name, company, title from remaining lines
  const remaining = lines.filter((_, i) => !used.has(i))
  remaining.forEach((line) => {
    if (!result.title && titleKw.test(line)) {
      result.title = line
    } else if (!result.name && /^[A-Z][a-zA-Z\-'\u00C0-\u024F]+(?:\s+[A-Z][a-zA-Z\-'\u00C0-\u024F]+){0,3}$/.test(line) && line.split(/\s+/).length <= 4 && line.length < 40) {
      result.name = line
    } else if (!result.company && line.length > 2 && !/^[+(\d]/.test(line)) {
      // If it looks like a company (contains Ltd, Inc, Corp, GmbH, LLC, Co., etc. or is uppercase-heavy)
      const corpKw = /\b(ltd|inc|corp|co\.|llc|gmbh|ag|s\.?a\.?|plc|pty|group|industries|solutions|technology|tech|systems|services|manufacturing|enterprise|international|global)\b/i
      const upperRatio = (line.match(/[A-Z]/g) || []).length / line.length
      if (corpKw.test(line) || upperRatio > 0.5) {
        result.company = line
      }
    }
  })

  // Fallback: first remaining line = name, second = company
  const leftover = remaining.filter((l) => l !== result.title && l !== result.name && l !== result.company)
  if (!result.name && leftover.length > 0) result.name = leftover.shift()
  if (!result.company && leftover.length > 0) result.company = leftover.shift()
  if (!result.title && leftover.length > 0 && titleKw.test(leftover[0])) result.title = leftover.shift()

  // Collect unparsed lines as notes
  const usedValues = new Set([result.name, result.company, result.title, result.email, result.phone, result.address, result.website].filter(Boolean))
  const extra = lines.filter((l) => !usedValues.has(l)).slice(0, 3)
  if (extra.length) result.notes = 'OCR extras: ' + extra.join(' | ')

  return result
}

/* ── Standard form fields per document type ─────────────────── */
const STANDARD_FORMS = {
  rfq: {
    title: 'Request for Quotation (RFQ)',
    fields: [
      { key: 'rfqNumber', label: 'RFQ Number', type: 'text', placeholder: 'RFQ-2026-001' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'dueDate', label: 'Response Due Date', type: 'date' },
      { key: 'buyerCompany', label: 'Buyer Company', type: 'text', placeholder: 'Your Company Name' },
      { key: 'buyerContact', label: 'Buyer Contact Person', type: 'text', placeholder: 'Full Name' },
      { key: 'buyerEmail', label: 'Buyer Email', type: 'email', placeholder: 'buyer@company.com' },
      { key: 'supplierCompany', label: 'Supplier Company', type: 'text', placeholder: 'Supplier Name' },
      { key: 'supplierContact', label: 'Supplier Contact', type: 'text', placeholder: 'Full Name' },
      { key: 'itemDescription', label: 'Item / Service Description', type: 'textarea', placeholder: 'Describe required items or services...' },
      { key: 'quantity', label: 'Quantity', type: 'text', placeholder: 'e.g. 1,000 pcs' },
      { key: 'deliveryTerms', label: 'Delivery Terms (Incoterms)', type: 'text', placeholder: 'e.g. FOB, CIF, DDP' },
      { key: 'deliveryDate', label: 'Required Delivery Date', type: 'date' },
      { key: 'paymentTerms', label: 'Payment Terms', type: 'text', placeholder: 'e.g. Net 30, LC at sight' },
      { key: 'technicalReqs', label: 'Technical Requirements', type: 'textarea', placeholder: 'Specifications, drawings, standards...' },
      { key: 'qualityReqs', label: 'Quality Requirements', type: 'text', placeholder: 'e.g. ISO 9001, IATF 16949' },
      { key: 'notes', label: 'Additional Notes', type: 'textarea', placeholder: 'Any other requirements...' },
    ],
  },
  quotation: {
    title: 'Quotation / Invoice',
    fields: [
      { key: 'docNumber', label: 'Document Number', type: 'text', placeholder: 'QUO-2026-001 / INV-2026-001' },
      { key: 'docType', label: 'Type', type: 'select', options: ['Quotation', 'Proforma Invoice', 'Commercial Invoice'] },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'validUntil', label: 'Valid Until', type: 'date' },
      { key: 'fromCompany', label: 'From (Company)', type: 'text', placeholder: 'Your Company' },
      { key: 'fromAddress', label: 'From (Address)', type: 'text', placeholder: 'Full address' },
      { key: 'toCompany', label: 'To (Company)', type: 'text', placeholder: 'Client Company' },
      { key: 'toAddress', label: 'To (Address)', type: 'text', placeholder: 'Client address' },
      { key: 'items', label: 'Line Items (description, qty, unit price)', type: 'textarea', placeholder: '1. Item A — 100 pcs — $25.00\n2. Item B — 50 pcs — $40.00' },
      { key: 'subtotal', label: 'Subtotal', type: 'text', placeholder: '$0.00' },
      { key: 'tax', label: 'Tax / VAT (%)', type: 'text', placeholder: '20%' },
      { key: 'totalAmount', label: 'Total Amount', type: 'text', placeholder: '$0.00' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'USD / EUR / CNY' },
      { key: 'paymentTerms', label: 'Payment Terms', type: 'text', placeholder: 'e.g. 50% advance, 50% before shipment' },
      { key: 'bankDetails', label: 'Bank Details', type: 'textarea', placeholder: 'Bank name, account, SWIFT...' },
      { key: 'notes', label: 'Notes / Terms & Conditions', type: 'textarea', placeholder: '' },
    ],
  },
  pr: {
    title: 'Purchasing Request',
    fields: [
      { key: 'prNumber', label: 'PR Number', type: 'text', placeholder: 'PR-2026-001' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'requester', label: 'Requester Name', type: 'text', placeholder: 'Full Name' },
      { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Production, Engineering' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'] },
      { key: 'itemDescription', label: 'Item / Service Description', type: 'textarea', placeholder: 'What needs to be purchased...' },
      { key: 'quantity', label: 'Quantity', type: 'text', placeholder: 'Amount and unit' },
      { key: 'estimatedCost', label: 'Estimated Cost', type: 'text', placeholder: '$0.00' },
      { key: 'budgetCode', label: 'Budget Code / Cost Center', type: 'text', placeholder: '' },
      { key: 'preferredSupplier', label: 'Preferred Supplier', type: 'text', placeholder: 'If any' },
      { key: 'requiredDate', label: 'Required By Date', type: 'date' },
      { key: 'justification', label: 'Business Justification', type: 'textarea', placeholder: 'Why is this purchase needed?' },
      { key: 'approver', label: 'Approver Name', type: 'text', placeholder: 'Manager / Director' },
      { key: 'notes', label: 'Additional Notes', type: 'textarea', placeholder: '' },
    ],
  },
  po: {
    title: 'Purchasing Order',
    fields: [
      { key: 'poNumber', label: 'PO Number', type: 'text', placeholder: 'PO-2026-001' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'buyerCompany', label: 'Buyer Company', type: 'text', placeholder: 'Your Company' },
      { key: 'buyerAddress', label: 'Buyer Address', type: 'text', placeholder: 'Full address' },
      { key: 'supplierCompany', label: 'Supplier Company', type: 'text', placeholder: 'Supplier Name' },
      { key: 'supplierAddress', label: 'Supplier Address', type: 'text', placeholder: 'Full address' },
      { key: 'items', label: 'Order Items (description, qty, unit price, total)', type: 'textarea', placeholder: '1. Part A — 500 pcs — $10.00 — $5,000.00' },
      { key: 'totalAmount', label: 'Total Amount', type: 'text', placeholder: '$0.00' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'USD / EUR' },
      { key: 'deliveryTerms', label: 'Delivery Terms (Incoterms)', type: 'text', placeholder: 'e.g. FOB Shanghai' },
      { key: 'deliveryDate', label: 'Delivery Date', type: 'date' },
      { key: 'deliveryAddress', label: 'Ship To Address', type: 'text', placeholder: 'Delivery address' },
      { key: 'paymentTerms', label: 'Payment Terms', type: 'text', placeholder: 'e.g. Net 30' },
      { key: 'qualityReqs', label: 'Quality Requirements', type: 'text', placeholder: 'Standards, certifications' },
      { key: 'authorizedBy', label: 'Authorized By', type: 'text', placeholder: 'Name and title' },
      { key: 'termsConditions', label: 'Terms & Conditions', type: 'textarea', placeholder: 'Warranty, penalties, packaging requirements...' },
    ],
  },
  sr: {
    title: 'Service Report',
    fields: [
      { key: 'reportNumber', label: 'Report Number', type: 'text', placeholder: 'SR-2026-001' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'serviceEngineer', label: 'Service Engineer', type: 'text', placeholder: 'Full Name' },
      { key: 'customerCompany', label: 'Customer Company', type: 'text', placeholder: 'Company Name' },
      { key: 'customerContact', label: 'Customer Contact', type: 'text', placeholder: 'Contact Person' },
      { key: 'location', label: 'Service Location', type: 'text', placeholder: 'Address / Site' },
      { key: 'equipmentName', label: 'Equipment / Machine', type: 'text', placeholder: 'Name and model' },
      { key: 'serialNumber', label: 'Serial Number', type: 'text', placeholder: '' },
      { key: 'serviceType', label: 'Service Type', type: 'select', options: ['Installation', 'Commissioning', 'Repair', 'Maintenance', 'Inspection', 'Training', 'Other'] },
      { key: 'arrivalTime', label: 'Arrival Time', type: 'text', placeholder: 'HH:MM' },
      { key: 'departureTime', label: 'Departure Time', type: 'text', placeholder: 'HH:MM' },
      { key: 'workDescription', label: 'Work Performed', type: 'textarea', placeholder: 'Detailed description of work done...' },
      { key: 'findings', label: 'Findings / Issues', type: 'textarea', placeholder: 'Problems found...' },
      { key: 'partsUsed', label: 'Parts / Materials Used', type: 'textarea', placeholder: 'Part name, qty...' },
      { key: 'status', label: 'Status', type: 'select', options: ['Completed', 'In Progress', 'Requires Follow-up', 'Pending Parts'] },
      { key: 'recommendations', label: 'Recommendations', type: 'textarea', placeholder: 'Next steps, suggestions...' },
      { key: 'customerSignature', label: 'Customer Signature (Name)', type: 'text', placeholder: 'Signed by' },
    ],
  },
}

/* ── Default document templates ─────────────────────────────── */
const DEFAULT_TEMPLATES = [
  { id: 'rfq', name: 'Request for Quotation (RFQ)', icon: 'doc', color: '#000888' },
  { id: 'quotation', name: 'Quotation / Invoice', icon: 'invoice', color: '#16a085' },
  { id: 'pr', name: 'Purchasing Request', icon: 'cart', color: '#e67e22' },
  { id: 'po', name: 'Purchasing Order', icon: 'order', color: '#8e44ad' },
  { id: 'sr', name: 'Service Report', icon: 'report', color: '#2c3e50' },
]

/* ── Industry options for contacts ──────────────────────────── */
const INDUSTRIES = [
  'Automotive', 'Machinery', 'Electronics', 'Medical', 'Raw Materials',
  'Plastic', 'Metal', 'Chemical', 'Aerospace', 'Energy', 'Other',
]

/* ── SVG helper icons ───────────────────────────────────────── */
const Icon = ({ name, size = 20, stroke = 'currentColor' }) => {
  switch (name) {
    case 'calendar':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={stroke} strokeWidth="2"/><path d="M3 10h18M8 2v4M16 2v4" stroke={stroke} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16" r="2" fill={stroke}/></svg>
    case 'supplier':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'service':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3 10-10M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'doc':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'invoice':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 18v-6M9 15l3 3 3-3" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'cart':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="21" r="1" stroke={stroke} strokeWidth="2"/><circle cx="20" cy="21" r="1" stroke={stroke} strokeWidth="2"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'order':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="8" y="2" width="8" height="4" rx="1" stroke={stroke} strokeWidth="2"/><path d="M9 14l2 2 4-4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'report':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 13h2v4H8zM12 11h2v6h-2zM16 15h2v2h-2z" fill={stroke} opacity="0.7"/></svg>
    case 'upload':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 8l-5-5-5 5M12 3v12" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'scan':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 12h10M12 7v10" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/><rect x="6" y="8" width="12" height="8" rx="1" stroke={stroke} strokeWidth="1.5" opacity="0.5"/></svg>
    case 'contact':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke={stroke} strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'delete':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'edit':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'download':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10l5 5 5-5M12 15V3" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'link':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    default:
      return null
  }
}

const DOCS_KEY = 'strefex-profile-docs'
const CONTACTS_KEY = 'strefex-profile-contacts'

const Profile = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const { t: tr } = useTranslation()

  /* ── Auth & subscription info ─────────────────────────────── */
  const role = useAuthStore((s) => s.role)
  const isSuperAdmin = role === 'superadmin'
  const isAdmin = role === 'admin' || isSuperAdmin
  const planId = useSubscriptionStore((s) => s.planId)
  const accountType = useSubscriptionStore((s) => s.accountType)
  const status = useSubscriptionStore((s) => s.status)
  const trialEndsAt = useSubscriptionStore((s) => s.trialEndsAt)
  const plan = getPlanById(planId)
  const limits = getEffectiveLimits(planId, accountType)
  const isAtLeastStandard = useTier(TIERS.STANDARD)

  // Docs & contacts are visible from Standard+ plan (or superadmin)
  const canSeeDocs = isAtLeastStandard || isSuperAdmin
  const canSeeContacts = isAtLeastStandard || isSuperAdmin

  /* ── Documents state — tenant-scoped persistence ──────────── */
  const [documents, setDocuments] = useState(() => {
    try {
      const raw = localStorage.getItem(tenantKey(DOCS_KEY))
      if (raw) return JSON.parse(raw)
    } catch { /* silent */ }
    return DEFAULT_TEMPLATES.map((t) => ({ ...t, files: [], savedForms: [] }))
  })

  // Persist documents to tenant-scoped localStorage
  useEffect(() => {
    try { localStorage.setItem(tenantKey(DOCS_KEY), JSON.stringify(documents)) } catch { /* silent */ }
  }, [documents])

  const [showUpload, setShowUpload] = useState(null) // template id
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newFormName, setNewFormName] = useState('')
  const [showFillForm, setShowFillForm] = useState(null) // template id
  const [formData, setFormData] = useState({})
  const [editFormIdx, setEditFormIdx] = useState(null) // index in savedForms
  const fileRef = useRef(null)

  /* ── Contacts state — tenant-scoped persistence ────────────── */
  const [contacts, setContacts] = useState(() => {
    try {
      const raw = localStorage.getItem(tenantKey(CONTACTS_KEY))
      if (raw) return JSON.parse(raw)
    } catch { /* silent */ }
    return []
  })

  // Persist contacts to tenant-scoped localStorage
  useEffect(() => {
    try { localStorage.setItem(tenantKey(CONTACTS_KEY), JSON.stringify(contacts)) } catch { /* silent */ }
  }, [contacts])

  const [showAddContact, setShowAddContact] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStatus, setScanStatus] = useState('') // '', 'loading', 'recognizing', 'parsing', 'done', 'error'
  const [scanPreview, setScanPreview] = useState(null) // image data URL
  const [scanResult, setScanResult] = useState(null) // parsed fields
  const [scanRawText, setScanRawText] = useState('')
  const [editContactId, setEditContactId] = useState(null)
  const [contactForm, setContactForm] = useState({
    name: '', company: '', title: '', email: '', phone: '',
    address: '', website: '', industry: '', type: 'Supplier', notes: '',
  })
  const scanFileRef = useRef(null)

  /* ── Document handlers ───────────────────────────────────── */
  const handleUploadFile = (templateId) => {
    setShowUpload(templateId)
    setTimeout(() => fileRef.current?.click(), 50)
  }

  const handleFileChange = (e) => {
    if (!e.target.files?.length || !showUpload) return
    const file = e.target.files[0]
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === showUpload
          ? { ...d, files: [...d.files, { id: Date.now(), name: file.name, size: file.size, date: new Date().toLocaleDateString() }] }
          : d
      )
    )
    setShowUpload(null)
    e.target.value = ''
  }

  const handleDeleteFile = (templateId, fileId) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === templateId
          ? { ...d, files: d.files.filter((f) => f.id !== fileId) }
          : d
      )
    )
  }

  const handleCreateForm = () => {
    if (!newFormName.trim()) return
    setDocuments((prev) => [
      ...prev,
      { id: `custom-${Date.now()}`, name: newFormName.trim(), icon: 'doc', color: '#34495e', files: [], savedForms: [] },
    ])
    setNewFormName('')
    setShowCreateForm(false)
  }

  const handleDeleteTemplate = (templateId) => {
    setDocuments((prev) => prev.filter((d) => d.id !== templateId))
  }

  /* ── Form fill handlers ─────────────────────────────────── */
  const handleOpenFillForm = (templateId, formIdx = null) => {
    const def = STANDARD_FORMS[templateId]
    if (!def) return
    if (formIdx !== null) {
      // Edit existing saved form
      const doc = documents.find((d) => d.id === templateId)
      if (doc?.savedForms?.[formIdx]) {
        setFormData(doc.savedForms[formIdx].data)
        setEditFormIdx(formIdx)
      }
    } else {
      // New blank form
      const blank = {}
      def.fields.forEach((f) => { blank[f.key] = '' })
      setFormData(blank)
      setEditFormIdx(null)
    }
    setShowFillForm(templateId)
  }

  const handleSaveFormData = () => {
    if (!showFillForm) return
    const def = STANDARD_FORMS[showFillForm]
    if (!def) return
    const label = formData[def.fields[0]?.key] || `Form ${new Date().toLocaleDateString()}`
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== showFillForm) return d
        const forms = [...(d.savedForms || [])]
        if (editFormIdx !== null) {
          forms[editFormIdx] = { ...forms[editFormIdx], data: { ...formData }, label, updatedAt: new Date().toLocaleDateString() }
        } else {
          forms.push({ id: `form-${Date.now()}`, data: { ...formData }, label, createdAt: new Date().toLocaleDateString(), updatedAt: new Date().toLocaleDateString() })
        }
        return { ...d, savedForms: forms }
      })
    )
    setShowFillForm(null)
    setFormData({})
    setEditFormIdx(null)
  }

  const handleDeleteSavedForm = (templateId, formIdx) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== templateId) return d
        const forms = [...(d.savedForms || [])]
        forms.splice(formIdx, 1)
        return { ...d, savedForms: forms }
      })
    )
  }

  /* ── Contact handlers ────────────────────────────────────── */
  const resetContactForm = () => {
    setContactForm({ name: '', company: '', title: '', email: '', phone: '', address: '', website: '', industry: '', type: 'Supplier', notes: '' })
    setEditContactId(null)
  }

  const handleSaveContact = () => {
    if (!contactForm.name.trim() || !contactForm.company.trim()) return
    if (editContactId) {
      setContacts((prev) => prev.map((c) => (c.id === editContactId ? { ...c, ...contactForm } : c)))
    } else {
      setContacts((prev) => [...prev, { ...contactForm, id: `cnt-${Date.now()}` }])
    }
    resetContactForm()
    setShowAddContact(false)
  }

  const handleEditContact = (contact) => {
    setContactForm({ name: contact.name, company: contact.company, title: contact.title, email: contact.email, phone: contact.phone, address: contact.address, website: contact.website, industry: contact.industry, type: contact.type, notes: contact.notes })
    setEditContactId(contact.id)
    setShowAddContact(true)
  }

  const handleDeleteContact = (id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }

  /* ── Scan business card (real OCR with Tesseract.js) ─────── */
  const resetScan = useCallback(() => {
    setScanProgress(0)
    setScanStatus('')
    setScanPreview(null)
    setScanResult(null)
    setScanRawText('')
  }, [])

  const handleScanFile = useCallback(async (e) => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    e.target.value = ''

    // Show image preview
    const reader = new FileReader()
    reader.onload = (ev) => setScanPreview(ev.target.result)
    reader.readAsDataURL(file)

    setScanStatus('loading')
    setScanProgress(5)
    setScanResult(null)
    setScanRawText('')

    try {
      const Tesseract = (await import('tesseract.js')).default
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setScanStatus('recognizing')
            setScanProgress(Math.round(10 + m.progress * 80))
          } else if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract' || m.status === 'loading language traineddata') {
            setScanStatus('loading')
            setScanProgress(Math.max(5, Math.round(m.progress * 10)))
          }
        },
      })

      setScanStatus('parsing')
      setScanProgress(95)
      setScanRawText(data.text)

      const parsed = parseBusinessCard(data.text)
      setScanResult(parsed)
      setScanProgress(100)
      setScanStatus('done')
    } catch (err) {
      console.error('OCR error:', err)
      setScanStatus('error')
      setScanProgress(0)
    }
  }, [])

  const handleAcceptScan = useCallback(() => {
    if (!scanResult) return
    setContactForm(scanResult)
    setShowScanModal(false)
    resetScan()
    setShowAddContact(true)
  }, [scanResult, resetScan])

  const handleCloseScan = useCallback(() => {
    setShowScanModal(false)
    resetScan()
  }, [resetScan])

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  /* ── Derived display values ─────────────────────────────── */
  const acctLabel = accountType === 'buyer' ? 'Buyer' : accountType === 'service_provider' ? 'Service Provider' : 'Seller'
  const roleLabel = isSuperAdmin ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1)
  const domain = user?.email ? user.email.split('@')[1] : '—'
  const statusLabel = status === 'trialing'
    ? `Trial (ends ${trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : '—'})`
    : status === 'canceled' ? 'Canceled' : 'Active'

  return (
    <AppLayout>
      <div className="profile-page">
        {/* ── Top row: Profile (left) + Quick Actions (right) ── */}
        <div className="prof-top-row">
          {/* Left: Profile Widget */}
          <div className="prof-left">
            <div className="prof-card prof-header-card">
              <div className="prof-avatar">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="prof-header-info">
                <h2 className="prof-name">{user?.fullName || user?.name || 'User'}</h2>
                <p className="prof-role">{tenant?.name || ''}</p>
              </div>
            </div>

            <div className="prof-card">
              <h3 className="prof-card-title">{tr('profile.accountInfo')}</h3>
              <div className="prof-info-grid">
                <div className="prof-info-item">
                  <span className="prof-info-label">Email</span>
                  <span className="prof-info-value">{user?.email || '—'}</span>
                </div>
                <div className="prof-info-item">
                  <span className="prof-info-label">Phone</span>
                  <span className="prof-info-value">{user?.phone || '—'}</span>
                </div>
                <div className="prof-info-item full">
                  <span className="prof-info-label">Company Address</span>
                  <span className="prof-info-value">{tenant?.metadata?.address || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="prof-right">
            <div className="prof-card">
              <h3 className="prof-card-title">{tr('profile.quickActions')}</h3>
              <p className="prof-card-subtitle">{tr('home.quickActionsDesc')}</p>
              <div className="prof-actions-list">
                <button className="prof-action-btn" onClick={() => navigate('/profile/calendar')}>
                  <span className="prof-action-icon" style={{ background: '#e8f4fd', color: '#2980b9' }}><Icon name="calendar" /></span>
                  {tr('profile.exhibitionCalendar')}
                  <span className="prof-action-arrow">›</span>
                </button>
                <button className="prof-action-btn" onClick={() => navigate('/add-supplier')}>
                  <span className="prof-action-icon" style={{ background: '#e8f5e9', color: '#27ae60' }}><Icon name="supplier" /></span>
                  Add Supplier
                  <span className="prof-action-arrow">›</span>
                </button>
                <button className="prof-action-btn prof-action-primary" onClick={() => navigate('/request-service')}>
                  <span className="prof-action-icon"><Icon name="service" /></span>
                  {tr('profile.requestService')}
                  <span className="prof-action-arrow">›</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Company & Plan Information Widget ──────────────── */}
        <div className="prof-card prof-company-card">
          <div className="prof-company-header">
            <div>
              <h3 className="prof-card-title">Company Information</h3>
              <p className="prof-card-subtitle">Your organization details and subscription plan.</p>
            </div>
            <div className="prof-company-actions">
              {isAdmin && (
                <button className="prof-btn-outline" onClick={() => navigate('/team')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Invite Team
                </button>
              )}
              <button className="prof-btn-primary" onClick={() => navigate('/plans')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {planId === 'premium' ? 'Manage Plan' : 'Upgrade Plan'}
              </button>
            </div>
          </div>

          <div className="prof-company-grid">
            <div className="prof-company-info-col">
              <div className="prof-info-grid">
                <div className="prof-info-item">
                  <span className="prof-info-label">Company</span>
                  <span className="prof-info-value">{tenant?.name || '—'}</span>
                </div>
                <div className="prof-info-item">
                  <span className="prof-info-label">Domain</span>
                  <span className="prof-info-value">{domain}</span>
                </div>
                <div className="prof-info-item">
                  <span className="prof-info-label">Account Type</span>
                  <span className="prof-info-value">
                    <span className={`prof-acct-badge prof-acct-${accountType}`}>{acctLabel}</span>
                  </span>
                </div>
                <div className="prof-info-item">
                  <span className="prof-info-label">Your Role</span>
                  <span className="prof-info-value">{roleLabel}</span>
                </div>
              </div>
            </div>

            <div className="prof-plan-col">
              <div className="prof-plan-card">
                <div className="prof-plan-badge-row">
                  <span className={`prof-plan-badge prof-plan-${planId}`}>{plan.name} Plan</span>
                  <span className={`prof-plan-status prof-status-${status}`}>{statusLabel}</span>
                </div>
                <div className="prof-plan-limits">
                  <div className="prof-plan-limit-item">
                    <span className="prof-plan-limit-label">Users</span>
                    <span className="prof-plan-limit-value">{limits.maxUsers === Infinity ? 'Unlimited' : `Up to ${limits.maxUsers}`}</span>
                  </div>
                  <div className="prof-plan-limit-item">
                    <span className="prof-plan-limit-label">Projects</span>
                    <span className="prof-plan-limit-value">{limits.maxProjects === Infinity ? 'Unlimited' : `Up to ${limits.maxProjects}`}</span>
                  </div>
                  <div className="prof-plan-limit-item">
                    <span className="prof-plan-limit-label">Industries</span>
                    <span className="prof-plan-limit-value">{limits.maxIndustries === Infinity ? 'Unlimited' : limits.maxIndustries === 0 ? 'N/A' : `Up to ${limits.maxIndustries}`}</span>
                  </div>
                  <div className="prof-plan-limit-item">
                    <span className="prof-plan-limit-label">Equipment Categories</span>
                    <span className="prof-plan-limit-value">{limits.maxCategories === Infinity ? 'Unlimited' : limits.maxCategories === 0 ? 'N/A' : `Up to ${limits.maxCategories}`}</span>
                  </div>
                </div>
                <div className="prof-plan-features">
                  {(plan.features || []).slice(0, 4).map((f, i) => (
                    <div key={i} className="prof-plan-feature"><span className="prof-plan-check">✓</span> {f}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Documentation Widget (Standard+ only) ──────────── */}
        {canSeeDocs ? (
        <div className="prof-card prof-docs-card">
          <div className="prof-docs-header">
            <div>
              <h3 className="prof-card-title">{tr('profile.documentation')}</h3>
              <p className="prof-card-subtitle">Create forms or upload documents for your business needs.</p>
            </div>
            <button className="prof-btn-primary" onClick={() => setShowCreateForm(true)}>
              <Icon name="supplier" size={16} /> New Template
            </button>
          </div>

          <div className="prof-docs-grid">
            {documents.map((tmpl) => (
              <div key={tmpl.id} className="prof-doc-template">
                <div className="prof-doc-template-header">
                  <span className="prof-doc-icon" style={{ background: tmpl.color + '18', color: tmpl.color }}>
                    <Icon name={tmpl.icon} size={18} />
                  </span>
                  <span className="prof-doc-name">{tmpl.name}</span>
                  <div className="prof-doc-template-actions">
                    {STANDARD_FORMS[tmpl.id] && (
                      <button className="prof-icon-btn" title="Fill form" onClick={() => handleOpenFillForm(tmpl.id)} style={{ color: tmpl.color }}>
                        <Icon name="edit" size={14} />
                      </button>
                    )}
                    <button className="prof-icon-btn" title="Upload file" onClick={() => handleUploadFile(tmpl.id)}>
                      <Icon name="upload" size={14} />
                    </button>
                    <button className="prof-icon-btn danger" title="Delete template" onClick={() => handleDeleteTemplate(tmpl.id)}>
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                </div>

                {/* Standard form badge */}
                {STANDARD_FORMS[tmpl.id] && (
                  <div className="prof-doc-form-badge">
                    <span className="prof-doc-badge-dot" style={{ background: tmpl.color }} />
                    Standard form &middot; {STANDARD_FORMS[tmpl.id].fields.length} fields
                  </div>
                )}

                {/* Saved filled forms */}
                {tmpl.savedForms?.length > 0 && (
                  <div className="prof-doc-saved-forms">
                    {tmpl.savedForms.map((sf, idx) => (
                      <div key={sf.id} className="prof-doc-saved-item">
                        <Icon name="doc" size={13} />
                        <span className="prof-doc-saved-label">{sf.label}</span>
                        <span className="prof-doc-file-meta">{sf.updatedAt}</span>
                        <button className="prof-icon-btn small" title="Edit" onClick={() => handleOpenFillForm(tmpl.id, idx)}>
                          <Icon name="edit" size={12} />
                        </button>
                        <button className="prof-icon-btn danger small" title="Delete" onClick={() => handleDeleteSavedForm(tmpl.id, idx)}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Uploaded files */}
                {tmpl.files.length > 0 && (
                  <div className="prof-doc-files">
                    {tmpl.files.map((f) => (
                      <div key={f.id} className="prof-doc-file">
                        <span className="prof-doc-file-name">{f.name}</span>
                        <span className="prof-doc-file-meta">{formatSize(f.size)} &middot; {f.date}</span>
                        <button className="prof-icon-btn danger small" onClick={() => handleDeleteFile(tmpl.id, f.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {!tmpl.files.length && !tmpl.savedForms?.length && !STANDARD_FORMS[tmpl.id] && (
                  <div className="prof-doc-empty">No files uploaded yet</div>
                )}
              </div>
            ))}
          </div>

          <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
        ) : (
        <div className="prof-card prof-locked-card">
          <div className="prof-locked-content">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#94a3b8" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
            <div>
              <h3 className="prof-card-title">Documentation</h3>
              <p className="prof-locked-msg">Available on Standard plan and above. Upgrade to create forms, upload and manage business documents privately.</p>
            </div>
            <button className="prof-btn-primary" onClick={() => navigate('/plans')}>Upgrade Plan</button>
          </div>
        </div>
        )}

        {/* ── Contact List Widget (Standard+ only) ─────────────── */}
        {canSeeContacts ? (
        <div className="prof-card prof-contacts-card">
          <div className="prof-contacts-header">
            <div>
              <h3 className="prof-card-title">{tr('profile.contactList')}</h3>
              <p className="prof-card-subtitle">Collect supplier and customer business card information.</p>
            </div>
            <div className="prof-contacts-header-btns">
              <button className="prof-btn-outline" onClick={() => { setShowScanModal(true) }}>
                <Icon name="scan" size={16} /> Scan Card
              </button>
              <button className="prof-btn-primary" onClick={() => { resetContactForm(); setShowAddContact(true) }}>
                <Icon name="supplier" size={16} /> Add Contact
              </button>
            </div>
          </div>

          {contacts.length === 0 ? (
            <div className="prof-contacts-empty">
              <Icon name="contact" size={40} />
              <p>No contacts yet. Add a contact manually or scan a business card.</p>
            </div>
          ) : (
            <div className="prof-contacts-grid">
              {contacts.map((c) => (
                <div key={c.id} className="prof-contact-card">
                  <div className="prof-contact-card-top">
                    <div className="prof-contact-avatar">{(c.name || '?').charAt(0).toUpperCase()}</div>
                    <div className="prof-contact-info">
                      <div className="prof-contact-name">{c.name}</div>
                      <div className="prof-contact-company">{c.company}</div>
                      {c.title && <div className="prof-contact-title">{c.title}</div>}
                    </div>
                    <span className={`prof-contact-type ${c.type.toLowerCase()}`}>{c.type}</span>
                  </div>
                  <div className="prof-contact-details">
                    {c.email && <div className="prof-contact-detail">✉ {c.email}</div>}
                    {c.phone && <div className="prof-contact-detail">☎ {c.phone}</div>}
                    {c.industry && <div className="prof-contact-detail"><Icon name="link" size={12} /> {c.industry}</div>}
                  </div>
                  <div className="prof-contact-card-actions">
                    <button className="prof-icon-btn" title="Edit" onClick={() => handleEditContact(c)}><Icon name="edit" size={14} /></button>
                    <button className="prof-icon-btn danger" title="Delete" onClick={() => handleDeleteContact(c.id)}><Icon name="delete" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        ) : (
        <div className="prof-card prof-locked-card">
          <div className="prof-locked-content">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#94a3b8" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
            <div>
              <h3 className="prof-card-title">Contact List</h3>
              <p className="prof-locked-msg">Available on Standard plan and above. Upgrade to manage supplier and customer contacts with business card scanning.</p>
            </div>
            <button className="prof-btn-primary" onClick={() => navigate('/plans')}>Upgrade Plan</button>
          </div>
        </div>
        )}

        {/* ── Create Template Modal ────────────────────────────── */}
        {showCreateForm && (
          <div className="prof-modal-overlay" onClick={() => setShowCreateForm(false)}>
            <div className="prof-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="prof-modal-title">Create Document Template</h3>
              <div className="prof-modal-body">
                <label className="prof-form-label">Template Name</label>
                <input
                  className="prof-form-input"
                  placeholder="e.g. Inspection Report"
                  value={newFormName}
                  onChange={(e) => setNewFormName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateForm()}
                  autoFocus
                />
              </div>
              <div className="prof-modal-footer">
                <button className="prof-btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
                <button className="prof-btn-primary" onClick={handleCreateForm}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Fill Standard Form Modal ──────────────────────────── */}
        {showFillForm && STANDARD_FORMS[showFillForm] && (
          <div className="prof-modal-overlay" onClick={() => { setShowFillForm(null); setFormData({}); setEditFormIdx(null) }}>
            <div className="prof-modal prof-modal-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="prof-modal-title">{STANDARD_FORMS[showFillForm].title}</h3>
              <div className="prof-modal-body">
                <div className="prof-form-grid">
                  {STANDARD_FORMS[showFillForm].fields.map((f) => (
                    <div key={f.key} className={`prof-form-group ${f.type === 'textarea' ? 'full' : ''}`}>
                      <label className="prof-form-label">{f.label}</label>
                      {f.type === 'textarea' ? (
                        <textarea
                          className="prof-form-input prof-form-textarea"
                          placeholder={f.placeholder || ''}
                          value={formData[f.key] || ''}
                          onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                        />
                      ) : f.type === 'select' ? (
                        <select
                          className="prof-form-input"
                          value={formData[f.key] || ''}
                          onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                        >
                          <option value="">Select...</option>
                          {f.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="prof-form-input"
                          type={f.type || 'text'}
                          placeholder={f.placeholder || ''}
                          value={formData[f.key] || ''}
                          onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="prof-modal-footer">
                <button className="prof-btn-secondary" onClick={() => { setShowFillForm(null); setFormData({}); setEditFormIdx(null) }}>Cancel</button>
                <button className="prof-btn-primary" onClick={handleSaveFormData}>
                  {editFormIdx !== null ? 'Save Changes' : 'Save Form'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add / Edit Contact Modal ─────────────────────────── */}
        {showAddContact && (
          <div className="prof-modal-overlay" onClick={() => { setShowAddContact(false); resetContactForm() }}>
            <div className="prof-modal prof-modal-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="prof-modal-title">{editContactId ? 'Edit Contact' : 'Add Contact'}</h3>
              <div className="prof-modal-body">
                <div className="prof-form-grid">
                  <div className="prof-form-group">
                    <label className="prof-form-label">Full Name *</label>
                    <input className="prof-form-input" placeholder="John Smith" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} autoFocus />
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Company *</label>
                    <input className="prof-form-input" placeholder="Company Ltd." value={contactForm.company} onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })} />
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Job Title</label>
                    <input className="prof-form-input" placeholder="Sales Manager" value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} />
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Email</label>
                    <input className="prof-form-input" type="email" placeholder="john@company.com" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Phone</label>
                    <input className="prof-form-input" placeholder="+1 (555) 123-4567" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Website</label>
                    <input className="prof-form-input" placeholder="www.company.com" value={contactForm.website} onChange={(e) => setContactForm({ ...contactForm, website: e.target.value })} />
                  </div>
                  <div className="prof-form-group full">
                    <label className="prof-form-label">Address</label>
                    <input className="prof-form-input" placeholder="123 Business St, City" value={contactForm.address} onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })} />
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Industry</label>
                    <select className="prof-form-input" value={contactForm.industry} onChange={(e) => setContactForm({ ...contactForm, industry: e.target.value })}>
                      <option value="">Select industry...</option>
                      {INDUSTRIES.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                  <div className="prof-form-group">
                    <label className="prof-form-label">Contact Type</label>
                    <select className="prof-form-input" value={contactForm.type} onChange={(e) => setContactForm({ ...contactForm, type: e.target.value })}>
                      <option value="Supplier">Supplier</option>
                      <option value="Customer">Customer</option>
                      <option value="Partner">Partner</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="prof-form-group full">
                    <label className="prof-form-label">Notes</label>
                    <textarea className="prof-form-input prof-form-textarea" placeholder="Additional notes..." value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="prof-modal-footer">
                <button className="prof-btn-secondary" onClick={() => { setShowAddContact(false); resetContactForm() }}>Cancel</button>
                <button className="prof-btn-primary" onClick={handleSaveContact}>{editContactId ? 'Save Changes' : 'Add Contact'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Scan Business Card Modal ─────────────────────────── */}
        {showScanModal && (
          <div className="prof-modal-overlay" onClick={scanStatus === 'recognizing' || scanStatus === 'loading' ? undefined : handleCloseScan}>
            <div className="prof-modal prof-modal-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="prof-modal-title">Scan Business Card</h3>
              <div className="prof-modal-body">

                {/* Upload area — shown when no image is loaded */}
                {!scanPreview && (
                  <div className="prof-scan-body">
                    <div className="prof-scan-area">
                      <Icon name="scan" size={48} />
                      <p>Upload a photo of a business card to automatically extract contact information.</p>
                      <button className="prof-btn-primary" onClick={() => scanFileRef.current?.click()}>
                        <Icon name="upload" size={16} /> Upload Card Image
                      </button>
                    </div>
                    <div className="prof-scan-features">
                      <div className="prof-scan-feature"><span className="prof-scan-check">✓</span> Auto-detect name, company, title</div>
                      <div className="prof-scan-feature"><span className="prof-scan-check">✓</span> Extract email, phone, website</div>
                      <div className="prof-scan-feature"><span className="prof-scan-check">✓</span> Detect address and industry</div>
                      <div className="prof-scan-feature"><span className="prof-scan-check">✓</span> Link to industry database</div>
                    </div>
                  </div>
                )}

                {/* Image preview + progress / results */}
                {scanPreview && (
                  <div className="prof-scan-result-area">
                    <div className="prof-scan-preview">
                      <img src={scanPreview} alt="Business card" className="prof-scan-img" />
                      {scanStatus !== 'done' && scanStatus !== 'error' && (
                        <div className="prof-scan-overlay">
                          <div className="prof-scan-progress-ring">
                            <svg viewBox="0 0 52 52" width="52" height="52">
                              <circle cx="26" cy="26" r="23" fill="none" stroke="#e0e0e0" strokeWidth="4" />
                              <circle cx="26" cy="26" r="23" fill="none" stroke="#000888" strokeWidth="4"
                                strokeDasharray={`${Math.round(144.5 * scanProgress / 100)} 144.5`}
                                strokeLinecap="round" transform="rotate(-90 26 26)" style={{ transition: 'stroke-dasharray 0.3s' }} />
                            </svg>
                            <span className="prof-scan-pct">{scanProgress}%</span>
                          </div>
                          <div className="prof-scan-status-text">
                            {scanStatus === 'loading' && 'Loading OCR engine...'}
                            {scanStatus === 'recognizing' && 'Recognizing text...'}
                            {scanStatus === 'parsing' && 'Parsing fields...'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Recognized fields */}
                    {scanStatus === 'done' && scanResult && (
                      <div className="prof-scan-fields">
                        <h4 className="prof-scan-fields-title">Recognized Information</h4>
                        <div className="prof-scan-field-grid">
                          {[
                            ['Name', scanResult.name],
                            ['Company', scanResult.company],
                            ['Title', scanResult.title],
                            ['Email', scanResult.email],
                            ['Phone', scanResult.phone],
                            ['Website', scanResult.website],
                            ['Address', scanResult.address],
                            ['Industry', scanResult.industry],
                          ].map(([label, val]) => (
                            <div key={label} className={`prof-scan-field ${val ? '' : 'empty'}`}>
                              <span className="prof-scan-field-label">{label}</span>
                              <span className="prof-scan-field-value">{val || '—'}</span>
                            </div>
                          ))}
                        </div>
                        {scanRawText && (
                          <details className="prof-scan-raw">
                            <summary>Raw OCR text</summary>
                            <pre className="prof-scan-raw-text">{scanRawText}</pre>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Error state */}
                    {scanStatus === 'error' && (
                      <div className="prof-scan-error">
                        <p>Failed to recognize text. Please try a clearer image.</p>
                        <button className="prof-btn-primary" onClick={() => { resetScan(); scanFileRef.current?.click() }}>
                          Try Again
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <input type="file" ref={scanFileRef} accept="image/*" style={{ display: 'none' }} onChange={handleScanFile} />
              </div>
              <div className="prof-modal-footer">
                {scanStatus === 'done' && (
                  <>
                    <button className="prof-btn-secondary" onClick={() => { resetScan(); scanFileRef.current?.click() }}>
                      Scan Another
                    </button>
                    <button className="prof-btn-primary" onClick={handleAcceptScan}>
                      Accept &amp; Add Contact
                    </button>
                  </>
                )}
                {scanStatus !== 'done' && (
                  <button className="prof-btn-secondary" onClick={handleCloseScan} disabled={scanStatus === 'recognizing' || scanStatus === 'loading'}>
                    {scanStatus && scanStatus !== 'error' ? 'Processing...' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default Profile
