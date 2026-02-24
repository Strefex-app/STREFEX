import { useState, useMemo, useCallback } from 'react'
import AppLayout from '../components/AppLayout'
import { PLANS, getPlanById, BUYER_TRIAL_DAYS } from '../services/stripeService'
import { PROMO_CODES } from '../services/featureFlags'
import { EQUIPMENT_CATEGORIES_BY_INDUSTRY } from '../data/equipmentCategoriesByIndustry'
import { useTransactionStore } from '../store/transactionStore'
import { useServiceRequestStore } from '../store/serviceRequestStore'
import { useAccountRegistry } from '../store/accountRegistry'
import useRfqStore from '../store/rfqStore'
import useAuditStore, { MODULES as AUDIT_MODULES, SEVERITIES as AUDIT_SEVERITIES } from '../store/auditStore'
import { useAuthStore } from '../store/authStore'
import { canAssignSuperadmin, isSuperadminEmail } from '../services/superadminAuth'
import './SuperAdminDashboard.css'

/* ── Local storage keys (shared with stores) ─────────── */
const SUB_KEY = 'strefex-subscription'
const IND_KEY = 'strefex-industries'
const CAT_KEY = 'strefex-categories'
const TICKET_KEY = 'strefex-support-tickets'
const MSG_KEY = 'strefex-messages'
const SEC_KEY = 'strefex-security-events'

/* ── Severity helpers ────────────────────────────────── */
const SEVERITY = {
  critical: { label: 'Critical', color: '#e74c3c', bg: 'rgba(231,76,60,.1)' },
  high:     { label: 'High',     color: '#e67e22', bg: 'rgba(230,126,34,.1)' },
  medium:   { label: 'Medium',   color: '#f39c12', bg: 'rgba(243,156,18,.1)' },
  low:      { label: 'Low',      color: '#3498db', bg: 'rgba(52,152,219,.1)' },
  info:     { label: 'Info',     color: '#95a5a6', bg: 'rgba(149,165,166,.1)' },
}

/* ── Security events — loaded from API in production ── */
function loadSecurityEvents() {
  try {
    const raw = localStorage.getItem(SEC_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return []
}

/* ── Blocked IPs — loaded from API in production ─────── */
const BLOCKED_IPS = []

/* ── Industry metadata ────────────────────────────────── */
const INDUSTRIES = [
  { id: 'automotive', label: 'Automotive', color: '#3498db' },
  { id: 'machinery', label: 'Machinery', color: '#2ecc71' },
  { id: 'electronics', label: 'Electronics', color: '#9b59b6' },
  { id: 'medical', label: 'Medical', color: '#e74c3c' },
]

/* ── Platform accounts — loaded from account registry ──── */
function loadDemoAccounts() {
  const key = 'strefex-admin-accounts'
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return []
}

/* ── Feature grants storage ───────────────────────────── */
const GRANTS_KEY = 'strefex-feature-grants'

function loadFeatureGrants() {
  try {
    const raw = localStorage.getItem(GRANTS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return []
}

function saveFeatureGrants(grants) {
  try { localStorage.setItem(GRANTS_KEY, JSON.stringify(grants)) } catch { /* */ }
}

/* ── Trial extensions / promo grants storage ────────────── */
const TRIAL_GRANTS_KEY = 'strefex-trial-grants'

function loadTrialGrants() {
  try {
    const raw = localStorage.getItem(TRIAL_GRANTS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return []
}

function saveTrialGrants(grants) {
  try { localStorage.setItem(TRIAL_GRANTS_KEY, JSON.stringify(grants)) } catch { /* */ }
}

const EXTEND_PERIODS = [
  { value: 7,   label: '7 Days' },
  { value: 14,  label: '14 Days' },
  { value: 30,  label: '30 Days' },
  { value: 60,  label: '60 Days' },
  { value: 90,  label: '90 Days' },
  { value: 180, label: '6 Months' },
  { value: 365, label: '1 Year' },
]

/* Grantable features — grouped by the plan tier that unlocks them */
const GRANTABLE_FEATURES = [
  // Basic-tier features (grantable to Free accounts)
  { key: 'teamManagement',     label: 'Team Management',        tier: 1, tierLabel: 'Basic' },
  { key: 'basicAnalytics',     label: 'Basic Analytics',        tier: 1, tierLabel: 'Basic' },
  { key: 'emailSupport',       label: 'Email Support',          tier: 1, tierLabel: 'Basic' },
  { key: 'multipleIndustries', label: 'Multiple Industries',    tier: 1, tierLabel: 'Basic' },
  // Standard-tier features (grantable to Free / Basic accounts)
  { key: 'advancedReports',    label: 'Advanced Reports',       tier: 2, tierLabel: 'Standard' },
  { key: 'executiveSummary',   label: 'Executive Summary',      tier: 2, tierLabel: 'Standard' },
  { key: 'prioritySupport',    label: 'Priority Support',       tier: 2, tierLabel: 'Standard' },
  // Premium-tier features (grantable to Free / Basic / Standard accounts)
  { key: 'productionManagement',  label: 'Production Management',  tier: 3, tierLabel: 'Premium' },
  { key: 'costManagement',        label: 'Cost Management',        tier: 3, tierLabel: 'Premium' },
  { key: 'auditManagement',       label: 'Audit Management',       tier: 3, tierLabel: 'Premium' },
  { key: 'customIntegrations',    label: 'Custom Integrations',    tier: 3, tierLabel: 'Premium' },
  { key: 'messenger',             label: 'Messenger',              tier: 3, tierLabel: 'Premium' },
  { key: 'profileContacts',       label: 'Profile Contacts',       tier: 3, tierLabel: 'Premium' },
  // Enterprise-tier features (grantable to lower-plan accounts)
  { key: 'enterpriseManagement',  label: 'Enterprise Management',  tier: 4, tierLabel: 'Enterprise' },
  { key: 'procurement',           label: 'Procurement',            tier: 4, tierLabel: 'Enterprise' },
  { key: 'contractManagement',    label: 'Contract Management',    tier: 4, tierLabel: 'Enterprise' },
  { key: 'spendAnalysis',         label: 'Spend Analysis',         tier: 4, tierLabel: 'Enterprise' },
  { key: 'complianceEsg',         label: 'Compliance & ESG',       tier: 4, tierLabel: 'Enterprise' },
  { key: 'aiInsights',            label: 'AI Insights',            tier: 4, tierLabel: 'Enterprise' },
  { key: 'erpIntegrations',       label: 'ERP Integrations',       tier: 4, tierLabel: 'Enterprise' },
  { key: 'templateLibrary',       label: 'Template Library',       tier: 4, tierLabel: 'Enterprise' },
  { key: 'auditLogs',             label: 'System Audit Logs',      tier: 4, tierLabel: 'Enterprise' },
]

/* Period options for feature grants */
const GRANT_PERIODS = [
  { value: 7,    label: '7 Days' },
  { value: 14,   label: '14 Days' },
  { value: 30,   label: '30 Days' },
  { value: 60,   label: '60 Days' },
  { value: 90,   label: '90 Days' },
  { value: 180,  label: '6 Months' },
  { value: 365,  label: '1 Year' },
  { value: 730,  label: '2 Years' },
  { value: 1095, label: '3 Years' },
  { value: 0,    label: 'Unlimited (no expiry)' },
]

/* ── Helpers ──────────────────────────────────────────── */
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const daysUntil = (iso) => {
  if (!iso) return null
  const diff = (new Date(iso).getTime() - Date.now()) / 86400000
  return Math.round(diff)
}

const planColor = (planId) => {
  const colors = { start: '#95a5a6', basic: '#3498db', standard: '#f39c12', premium: '#8e44ad', enterprise: '#000888' }
  return colors[planId] || '#999'
}

/* ── Donut chart (pure SVG) ──────────────────────────── */
function DonutChart({ segments, size = 100, thickness = 16 }) {
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="sad-donut">
      {segments.map((seg, i) => {
        const pct = seg.value / total
        const dash = pct * circumference
        const gap = circumference - dash
        const currentOffset = offset
        offset += pct * circumference
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-currentOffset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray .5s, stroke-dashoffset .5s' }}
          />
        )
      })}
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--sad-text, #1a1a2e)">{total}</text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize="11" fill="var(--sad-muted, #888)">Total</text>
    </svg>
  )
}

/* ── Mini bar chart ──────────────────────────────────── */
function MiniBarChart({ items, maxVal }) {
  const mx = maxVal || Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="sad-bar-chart">
      {items.map((item, i) => (
        <div key={i} className="sad-bar-row">
          <span className="sad-bar-label">{item.label}</span>
          <div className="sad-bar-track">
            <div className="sad-bar-fill" style={{ width: `${(item.value / mx) * 100}%`, background: item.color || '#000888' }} />
          </div>
          <span className="sad-bar-val">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  SUPER ADMIN DASHBOARD
 * ═══════════════════════════════════════════════════════ */
export default function SuperAdminDashboard() {
  const [accounts] = useState(loadDemoAccounts)
  const [tab, setTab] = useState('overview')     // overview | accounts | security | transactions | service-requests | roles | rfq-analytics | feature-grants
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [securityEvents, setSecurityEvents] = useState(loadSecurityEvents)
  const [secFilter, setSecFilter] = useState('all')         // all | critical | high | medium | low
  const [secTypeFilter, setSecTypeFilter] = useState('all') // all | brute_force | sql_injection | etc.
  const [blockedIps] = useState(BLOCKED_IPS)

  /* ── Transaction & Service Request stores ────────────── */
  const allTransactions = useTransactionStore((s) => s.transactions)
  const totalRevenue = useTransactionStore((s) => s.getTotalRevenue)()
  const pendingPayments = useTransactionStore((s) => s.getPendingPayments)()

  const serviceRequests = useServiceRequestStore((s) => s.requests)
  const srStats = useServiceRequestStore((s) => s.getStats)()
  const assignRequest = useServiceRequestStore((s) => s.assignRequest)
  const updateRequestStatus = useServiceRequestStore((s) => s.updateRequestStatus)

  const registryAccounts = useAccountRegistry((s) => s.accounts)
  const updateRegistryAccount = useAccountRegistry((s) => s.updateAccount)

  /* ── Trial & promo grants state ──────────────────────── */
  const [trialGrants, setTrialGrants] = useState(loadTrialGrants)
  const [trialTargetCompany, setTrialTargetCompany] = useState('')
  const [trialExtendDays, setTrialExtendDays] = useState(30)
  const [trialPromoCode, setTrialPromoCode] = useState('')
  const [trialFeedback, setTrialFeedback] = useState('')

  const buyerAccounts = useMemo(
    () => [...accounts, ...registryAccounts].filter((a) => a.accountType === 'buyer'),
    [accounts, registryAccounts]
  )

  /* ── Feature grants state ────────────────────────────── */
  const [featureGrants, setFeatureGrants] = useState(loadFeatureGrants)
  const [grantCompany, setGrantCompany] = useState('')
  const [grantFeatures, setGrantFeatures] = useState([])
  const [grantPeriod, setGrantPeriod] = useState(30)
  const [grantFeedback, setGrantFeedback] = useState('')

  const activeGrants = useMemo(() => featureGrants.filter(
    (g) => !g.expiresAt || new Date(g.expiresAt) > new Date()
  ), [featureGrants])

  const expiredGrants = useMemo(() => featureGrants.filter(
    (g) => g.expiresAt && new Date(g.expiresAt) <= new Date()
  ), [featureGrants])

  const selectedGrantAccount = useMemo(() => accounts.find((a) => a.id === grantCompany), [accounts, grantCompany])

  /* Features that can be granted to the selected account (only features above their current plan) */
  const availableGrantFeatures = useMemo(() => {
    if (!selectedGrantAccount) return []
    const plan = getPlanById(selectedGrantAccount.plan)
    const currentTier = plan.tier ?? 0
    // Only show features from higher tiers
    return GRANTABLE_FEATURES.filter((f) => f.tier > currentTier)
  }, [selectedGrantAccount])

  const handleGrantFeature = useCallback(() => {
    if (!grantCompany || grantFeatures.length === 0) return
    const acct = accounts.find((a) => a.id === grantCompany)
    if (!acct) return

    const now = new Date()
    const expiresAt = grantPeriod > 0
      ? new Date(now.getTime() + grantPeriod * 86400000).toISOString()
      : null // unlimited

    const newGrants = grantFeatures.map((featureKey) => ({
      id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      accountId: acct.id,
      company: acct.company,
      email: acct.email,
      accountType: acct.accountType,
      plan: acct.plan,
      featureKey,
      featureLabel: GRANTABLE_FEATURES.find((f) => f.key === featureKey)?.label || featureKey,
      grantedAt: now.toISOString(),
      expiresAt,
      periodDays: grantPeriod,
      grantedBy: 'superadmin',
      status: 'active',
    }))

    const updated = [...featureGrants, ...newGrants]
    setFeatureGrants(updated)
    saveFeatureGrants(updated)
    setGrantFeatures([])
    setGrantFeedback(`Granted ${newGrants.length} feature(s) to ${acct.company}`)
    setTimeout(() => setGrantFeedback(''), 4000)
  }, [grantCompany, grantFeatures, grantPeriod, accounts, featureGrants])

  const handleRevokeGrant = useCallback((grantId) => {
    const updated = featureGrants.filter((g) => g.id !== grantId)
    setFeatureGrants(updated)
    saveFeatureGrants(updated)
    setGrantFeedback('Feature grant revoked')
    setTimeout(() => setGrantFeedback(''), 3000)
  }, [featureGrants])

  const handleExtendGrant = useCallback((grantId, extraDays) => {
    const updated = featureGrants.map((g) => {
      if (g.id !== grantId) return g
      const base = g.expiresAt ? new Date(g.expiresAt) : new Date()
      const newExpiry = new Date(base.getTime() + extraDays * 86400000)
      return { ...g, expiresAt: newExpiry.toISOString(), periodDays: (g.periodDays || 0) + extraDays }
    })
    setFeatureGrants(updated)
    saveFeatureGrants(updated)
    setGrantFeedback(`Grant extended by ${extraDays} days`)
    setTimeout(() => setGrantFeedback(''), 3000)
  }, [featureGrants])

  /* ── RFQ stores ──────────────────────────────────────── */
  const allBuyerRfqs = useRfqStore((s) => s.rfqs)
  const allReceivedRfqs = useRfqStore((s) => s.receivedRfqs)
  const [selectedRfqCompany, setSelectedRfqCompany] = useState(null)
  const [selectedRfqDetail, setSelectedRfqDetail] = useState(null)

  /* ── Role management state ───────────────────────────── */
  const [roleSearch, setRoleSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selectedRoleUser, setSelectedRoleUser] = useState(null)
  const [srSelectedRequest, setSrSelectedRequest] = useState(null)
  const [srAssignEmail, setSrAssignEmail] = useState('')
  const [srNewStatus, setSrNewStatus] = useState('')

  /* ── Computed analytics ──────────────────────────────── */
  const analytics = useMemo(() => {
    const total = accounts.length
    const buyers = accounts.filter((a) => a.accountType === 'buyer')
    const sellers = accounts.filter((a) => a.accountType === 'seller')
    const serviceProviders = accounts.filter((a) => a.accountType === 'service_provider')
    const active = accounts.filter((a) => a.status === 'active')
    const trialing = accounts.filter((a) => a.status === 'trialing')
    const canceled = accounts.filter((a) => a.status === 'canceled')
    const totalTeamMembers = accounts.reduce((s, a) => s + (a.teamMembers?.length || 0), 0)

    // Plan distribution
    const planCounts = {}
    PLANS.forEach((p) => { planCounts[p.id] = 0 })
    accounts.forEach((a) => { planCounts[a.plan] = (planCounts[a.plan] || 0) + 1 })
    const paid = accounts.filter((a) => a.plan !== 'start')
    const free = accounts.filter((a) => a.plan === 'start')

    // Industry distribution
    const industryCounts = {}
    INDUSTRIES.forEach((ind) => { industryCounts[ind.id] = 0 })
    accounts.forEach((a) => {
      (a.industry || []).forEach((ind) => { industryCounts[ind] = (industryCounts[ind] || 0) + 1 })
    })

    // Equipment distribution (top 10)
    const equipCounts = {}
    accounts.forEach((a) => {
      Object.entries(a.categories || {}).forEach(([ind, cats]) => {
        cats.forEach((cat) => {
          const catDef = (EQUIPMENT_CATEGORIES_BY_INDUSTRY[ind] || []).find((c) => c.id === cat)
          const label = catDef ? catDef.name : cat
          equipCounts[label] = (equipCounts[label] || 0) + 1
        })
      })
    })
    const topEquipment = Object.entries(equipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value, color: '#000888' }))

    // Revenue estimation
    const monthlyRevenue = accounts.reduce((sum, a) => {
      const plan = PLANS.find((p) => p.id === a.plan)
      if (!plan) return sum
      const price = plan.price
      return a.status !== 'canceled' ? sum + price : sum
    }, 0)

    // Registration timeline (last 6 months)
    const now = Date.now()
    const monthMs = 30 * 86400000
    const regTimeline = []
    for (let i = 5; i >= 0; i--) {
      const from = now - (i + 1) * monthMs
      const to = now - i * monthMs
      const count = accounts.filter((a) => {
        const t = new Date(a.registeredAt).getTime()
        return t >= from && t < to
      }).length
      const d = new Date(to)
      regTimeline.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), value: count, color: '#000888' })
    }

    // Total users & projects
    const totalUsers = accounts.reduce((s, a) => s + (a.users || 0), 0)
    const totalProjects = accounts.reduce((s, a) => s + (a.projects || 0), 0)

    // Expiring soon (within 30 days)
    const expiringSoon = accounts.filter((a) => {
      const d = daysUntil(a.validUntil)
      return d !== null && d >= 0 && d <= 30 && a.status !== 'canceled'
    })

    // Recently registered (last 14 days)
    const recentlyRegistered = accounts
      .filter((a) => (now - new Date(a.registeredAt).getTime()) < 14 * 86400000)
      .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))

    return {
      total, buyers, sellers, serviceProviders, active, trialing, canceled,
      totalTeamMembers,
      planCounts, paid, free,
      industryCounts, topEquipment,
      monthlyRevenue, regTimeline,
      totalUsers, totalProjects,
      expiringSoon, recentlyRegistered,
    }
  }, [accounts])

  /* ── Security analytics ─────────────────────────────── */
  const secAnalytics = useMemo(() => {
    const total = securityEvents.length
    const critical = securityEvents.filter((e) => e.severity === 'critical').length
    const high = securityEvents.filter((e) => e.severity === 'high').length
    const medium = securityEvents.filter((e) => e.severity === 'medium').length
    const low = securityEvents.filter((e) => e.severity === 'low' || e.severity === 'info').length
    const blocked = securityEvents.filter((e) => e.status === 'blocked').length
    const mitigated = securityEvents.filter((e) => e.status === 'mitigated').length
    const monitoring = securityEvents.filter((e) => e.status === 'monitoring' || e.status === 'flagged').length

    // Last 24h
    const last24h = securityEvents.filter((e) => (Date.now() - new Date(e.timestamp).getTime()) < 86400000).length

    // By type
    const typeCounts = {}
    securityEvents.forEach((e) => {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
    })

    // Unique attacker countries
    const countries = [...new Set(securityEvents.filter((e) => e.country && e.country !== '—').map((e) => e.country))]

    // Threat score (0-100)
    const threatScore = Math.min(100, Math.round(
      (critical * 25 + high * 15 + medium * 5 + low * 1) / Math.max(total, 1) * 10
    ))

    return { total, critical, high, medium, low, blocked, mitigated, monitoring, last24h, typeCounts, countries, threatScore }
  }, [securityEvents])

  const filteredSecEvents = useMemo(() => {
    let list = [...securityEvents]
    if (secFilter !== 'all') list = list.filter((e) => e.severity === secFilter)
    if (secTypeFilter !== 'all') list = list.filter((e) => e.type === secTypeFilter)
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [securityEvents, secFilter, secTypeFilter])

  const handleDismissEvent = (id) => {
    const updated = securityEvents.filter((e) => e.id !== id)
    setSecurityEvents(updated)
    try { localStorage.setItem(SEC_KEY, JSON.stringify(updated)) } catch { /* */ }
  }

  const handleEscalateEvent = (id) => {
    const updated = securityEvents.map((e) =>
      e.id === id ? { ...e, status: 'escalated', action: e.action + ' | Escalated to security team' } : e
    )
    setSecurityEvents(updated)
    try { localStorage.setItem(SEC_KEY, JSON.stringify(updated)) } catch { /* */ }
  }

  /* ── Filtered account list ──────────────────────────── */
  const filteredAccounts = useMemo(() => {
    let list = [...accounts]
    if (filterPlan !== 'all') list = list.filter((a) => a.plan === filterPlan)
    if (filterType !== 'all') list = list.filter((a) => a.accountType === filterType)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        a.company.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))
  }, [accounts, filterPlan, filterType, search])

  /* ── Tab: Overview ──────────────────────────────────── */
  const renderOverview = () => (
    <>
      {/* KPI cards */}
      <div className="sad-kpis">
        <div className="sad-kpi">
          <div className="sad-kpi-icon blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{analytics.total}</div>
            <div className="sad-kpi-label">Total Accounts</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{analytics.buyers.length}</div>
            <div className="sad-kpi-label">Buyers</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{analytics.sellers.length}</div>
            <div className="sad-kpi-label">Sellers</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon teal">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{analytics.serviceProviders.length}</div>
            <div className="sad-kpi-label">Service Providers</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon orange">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">${analytics.monthlyRevenue.toLocaleString()}</div>
            <div className="sad-kpi-label">Monthly Revenue</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon rose">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{analytics.totalUsers}</div>
            <div className="sad-kpi-label">Total Users</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{analytics.totalTeamMembers}</div>
            <div className="sad-kpi-label">Team Members</div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="sad-charts-row">
        {/* Plan distribution */}
        <div className="sad-widget">
          <h3 className="sad-widget-title">Plan Distribution</h3>
          <div className="sad-donut-row">
            <DonutChart segments={PLANS.map((p) => ({ value: analytics.planCounts[p.id] || 0, color: planColor(p.id) }))} />
            <div className="sad-donut-legend">
              {PLANS.map((p) => (
                <div key={p.id} className="sad-legend-item">
                  <span className="sad-legend-dot" style={{ background: planColor(p.id) }} />
                  <span className="sad-legend-label">{p.name}</span>
                  <span className="sad-legend-count">{analytics.planCounts[p.id] || 0}</span>
                </div>
              ))}
              <div className="sad-legend-divider" />
              <div className="sad-legend-item">
                <span className="sad-legend-dot" style={{ background: '#2ecc71' }} />
                <span className="sad-legend-label sad-legend-bold">Paid</span>
                <span className="sad-legend-count">{analytics.paid.length}</span>
              </div>
              <div className="sad-legend-item">
                <span className="sad-legend-dot" style={{ background: '#95a5a6' }} />
                <span className="sad-legend-label sad-legend-bold">Free</span>
                <span className="sad-legend-count">{analytics.free.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Buyer vs Seller vs Service Provider */}
        <div className="sad-widget">
          <h3 className="sad-widget-title">Account Types</h3>
          <div className="sad-donut-row">
            <DonutChart segments={[
              { value: analytics.buyers.length, color: '#3498db' },
              { value: analytics.sellers.length, color: '#9b59b6' },
              { value: analytics.serviceProviders.length, color: '#27ae60' },
            ]} />
            <div className="sad-donut-legend">
              <div className="sad-legend-item"><span className="sad-legend-dot" style={{ background: '#3498db' }} /><span className="sad-legend-label">Buyers</span><span className="sad-legend-count">{analytics.buyers.length}</span></div>
              <div className="sad-legend-item"><span className="sad-legend-dot" style={{ background: '#9b59b6' }} /><span className="sad-legend-label">Sellers</span><span className="sad-legend-count">{analytics.sellers.length}</span></div>
              <div className="sad-legend-item"><span className="sad-legend-dot" style={{ background: '#27ae60' }} /><span className="sad-legend-label">Service Providers</span><span className="sad-legend-count">{analytics.serviceProviders.length}</span></div>
              <div className="sad-legend-divider" />
              <div className="sad-legend-item"><span className="sad-legend-dot" style={{ background: '#2ecc71' }} /><span className="sad-legend-label">Active</span><span className="sad-legend-count">{analytics.active.length}</span></div>
              <div className="sad-legend-item"><span className="sad-legend-dot" style={{ background: '#f39c12' }} /><span className="sad-legend-label">Trialing</span><span className="sad-legend-count">{analytics.trialing.length}</span></div>
              <div className="sad-legend-item"><span className="sad-legend-dot" style={{ background: '#e74c3c' }} /><span className="sad-legend-label">Canceled</span><span className="sad-legend-count">{analytics.canceled.length}</span></div>
            </div>
          </div>
        </div>

        {/* Registrations trend */}
        <div className="sad-widget">
          <h3 className="sad-widget-title">Registrations (6 months)</h3>
          <MiniBarChart items={analytics.regTimeline} />
        </div>
      </div>

      {/* Industry + Equipment row */}
      <div className="sad-charts-row">
        <div className="sad-widget">
          <h3 className="sad-widget-title">Industry Coverage</h3>
          <MiniBarChart
            items={INDUSTRIES.map((ind) => ({ label: ind.label, value: analytics.industryCounts[ind.id] || 0, color: ind.color }))}
          />
        </div>
        <div className="sad-widget sad-widget-wide">
          <h3 className="sad-widget-title">Top Equipment Categories</h3>
          <MiniBarChart items={analytics.topEquipment} />
        </div>
      </div>

      {/* Bottom panels */}
      <div className="sad-bottom-row">
        {/* Recently registered */}
        <div className="sad-widget">
          <h3 className="sad-widget-title">Recently Registered</h3>
          <div className="sad-recent-list">
            {analytics.recentlyRegistered.length === 0 && <div className="sad-empty">No new registrations</div>}
            {analytics.recentlyRegistered.map((a) => (
              <div key={a.id} className="sad-recent-item" onClick={() => { setSelectedAccount(a); setTab('accounts') }}>
                <div className="sad-recent-avatar" style={{ background: a.accountType === 'buyer' ? '#3498db' : a.accountType === 'service_provider' ? '#27ae60' : '#9b59b6' }}>
                  {a.accountType === 'buyer' ? 'B' : a.accountType === 'service_provider' ? 'SP' : 'S'}
                </div>
                <div className="sad-recent-info">
                  <div className="sad-recent-company">{a.company}</div>
                  <div className="sad-recent-meta">{a.name} &middot; {fmtDate(a.registeredAt)}</div>
                </div>
                <span className="sad-plan-badge" style={{ background: planColor(a.plan) + '1a', color: planColor(a.plan) }}>
                  {PLANS.find((p) => p.id === a.plan)?.name || a.plan}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Expiring soon */}
        <div className="sad-widget">
          <h3 className="sad-widget-title">Subscriptions Expiring Soon</h3>
          <div className="sad-recent-list">
            {analytics.expiringSoon.length === 0 && <div className="sad-empty">No subscriptions expiring within 30 days</div>}
            {analytics.expiringSoon.sort((a, b) => daysUntil(a.validUntil) - daysUntil(b.validUntil)).map((a) => {
              const d = daysUntil(a.validUntil)
              return (
                <div key={a.id} className="sad-recent-item" onClick={() => { setSelectedAccount(a); setTab('accounts') }}>
                  <div className="sad-recent-avatar" style={{ background: d <= 7 ? '#e74c3c' : '#f39c12' }}>
                    {d}d
                  </div>
                  <div className="sad-recent-info">
                    <div className="sad-recent-company">{a.company}</div>
                    <div className="sad-recent-meta">{PLANS.find((p) => p.id === a.plan)?.name} &middot; Expires {fmtDate(a.validUntil)}</div>
                  </div>
                  <span className="sad-plan-badge sad-badge-warn">Renew</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Revenue per plan */}
        <div className="sad-widget">
          <h3 className="sad-widget-title">Revenue by Plan (Monthly)</h3>
          <MiniBarChart
            items={PLANS.filter((p) => p.price > 0).map((p) => {
              const count = accounts.filter((a) => a.plan === p.id && a.status !== 'canceled')
              const revenue = count.reduce((s, a) => s + p.price, 0)
              return { label: `${p.name} (${count.length})`, value: revenue, color: planColor(p.id) }
            })}
          />
          <div className="sad-revenue-total">
            Total: <strong>${analytics.monthlyRevenue.toLocaleString()}/mo</strong>
          </div>
        </div>
      </div>
    </>
  )

  /* ── Tab: Accounts table ─────────────────────────────── */
  const renderAccounts = () => (
    <>
      {/* Filters */}
      <div className="sad-filters">
        <input className="sad-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, email, name..." />
        <select className="sad-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="buyer">Buyers</option>
          <option value="seller">Sellers</option>
          <option value="service_provider">Service Providers</option>
        </select>
        <select className="sad-select" value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}>
          <option value="all">All Plans</option>
          {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="sad-filter-count">{filteredAccounts.length} accounts</div>
      </div>

      <div className="sad-table-wrap">
        <table className="sad-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Industries</th>
              <th>Equipment</th>
              <th>Users</th>
              <th>Projects</th>
              <th>Registered</th>
              <th>Valid Until</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((a) => {
              const d = daysUntil(a.validUntil)
              const isExpiring = d !== null && d >= 0 && d <= 30
              const isExpired = d !== null && d < 0
              return (
                <tr key={a.id} className={`sad-row ${selectedAccount?.id === a.id ? 'selected' : ''}`} onClick={() => setSelectedAccount(selectedAccount?.id === a.id ? null : a)}>
                  <td className="sad-cell-company">
                    <div className="sad-company-name">{a.company}</div>
                    <div className="sad-company-id">{a.id}</div>
                  </td>
                  <td>
                    <div className="sad-contact-name">{a.name}</div>
                    <div className="sad-contact-email">{a.email}</div>
                  </td>
                  <td>
                    <span className={`sad-type-badge ${a.accountType}`}>{a.accountType === 'buyer' ? 'Buyer' : a.accountType === 'service_provider' ? 'Service' : 'Seller'}</span>
                  </td>
                  <td>
                    <span className="sad-plan-badge" style={{ background: planColor(a.plan) + '1a', color: planColor(a.plan) }}>
                      {PLANS.find((p) => p.id === a.plan)?.name || a.plan}
                    </span>
                  </td>
                  <td>
                    <span className={`sad-status-dot ${a.status}`} />
                    {a.status === 'active' ? 'Active' : a.status === 'trialing' ? 'Trial' : 'Canceled'}
                  </td>
                  <td>
                    <div className="sad-cell-tags">
                      {(a.industry || []).map((ind) => {
                        const meta = INDUSTRIES.find((i) => i.id === ind)
                        return <span key={ind} className="sad-mini-tag" style={{ color: meta?.color }}>{meta?.label || ind}</span>
                      })}
                    </div>
                  </td>
                  <td>
                    <span className="sad-equip-count">{Object.values(a.categories || {}).flat().length} cat.</span>
                  </td>
                  <td className="sad-cell-num">{a.users}</td>
                  <td className="sad-cell-num">{a.projects}</td>
                  <td className="sad-cell-date">{fmtDate(a.registeredAt)}</td>
                  <td className={`sad-cell-date ${isExpiring ? 'warn' : ''} ${isExpired ? 'expired' : ''}`}>
                    {a.plan === 'start' ? 'Free' : fmtDate(a.validUntil)}
                    {isExpiring && <span className="sad-days-badge">{d}d</span>}
                  </td>
                  <td className="sad-cell-date">{fmtDate(a.lastActive)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Account detail panel */}
      {selectedAccount && (
        <div className="sad-account-detail">
          <div className="sad-detail-header">
            <div>
              <h3 className="sad-detail-company">{selectedAccount.company}</h3>
              <p className="sad-detail-email">{selectedAccount.email}</p>
            </div>
            <button className="sad-detail-close" onClick={() => setSelectedAccount(null)}>Close</button>
          </div>
          <div className="sad-detail-grid">
            <div className="sad-detail-item"><span className="sad-detail-label">Account ID</span><span className="sad-detail-value">{selectedAccount.id}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Contact Person</span><span className="sad-detail-value">{selectedAccount.name}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Account Type</span><span className="sad-detail-value">{selectedAccount.accountType === 'buyer' ? 'Buyer' : selectedAccount.accountType === 'service_provider' ? 'Service Provider' : 'Seller'}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Plan</span><span className="sad-detail-value" style={{ color: planColor(selectedAccount.plan) }}>{PLANS.find((p) => p.id === selectedAccount.plan)?.name}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Status</span><span className="sad-detail-value">{selectedAccount.status}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Users</span><span className="sad-detail-value">{selectedAccount.users}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Projects</span><span className="sad-detail-value">{selectedAccount.projects}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Registered</span><span className="sad-detail-value">{fmtDate(selectedAccount.registeredAt)}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Valid Until</span><span className="sad-detail-value">{selectedAccount.plan === 'start' ? 'Free (no expiry)' : fmtDate(selectedAccount.validUntil)}</span></div>
            <div className="sad-detail-item"><span className="sad-detail-label">Last Active</span><span className="sad-detail-value">{fmtDate(selectedAccount.lastActive)}</span></div>
          </div>
          <div className="sad-detail-section">
            <h4>Industries</h4>
            <div className="sad-detail-tags">
              {(selectedAccount.industry || []).map((ind) => {
                const meta = INDUSTRIES.find((i) => i.id === ind)
                return <span key={ind} className="sad-tag" style={{ borderColor: meta?.color, color: meta?.color }}>{meta?.label || ind}</span>
              })}
            </div>
          </div>
          <div className="sad-detail-section">
            <h4>Equipment Categories</h4>
            {Object.entries(selectedAccount.categories || {}).map(([ind, cats]) => (
              <div key={ind} className="sad-detail-cats">
                <span className="sad-cat-industry">{INDUSTRIES.find((i) => i.id === ind)?.label || ind}:</span>
                {cats.map((cat) => {
                  const catDef = (EQUIPMENT_CATEGORIES_BY_INDUSTRY[ind] || []).find((c) => c.id === cat)
                  return <span key={cat} className="sad-cat-chip">{catDef?.name || cat}</span>
                })}
              </div>
            ))}
          </div>
          {(selectedAccount.teamMembers?.length > 0) && (
            <div className="sad-detail-section">
              <h4>Team Members ({selectedAccount.teamMembers.length})</h4>
              <div className="sad-detail-team">
                {selectedAccount.teamMembers.map((tm) => (
                  <div key={tm.id || tm.email} className="sad-detail-team-row">
                    <span className="sad-detail-team-name">{tm.name}</span>
                    <span className="sad-detail-team-email">{tm.email}</span>
                    <span className={`sad-detail-team-role tm-role-${tm.role}`}>{tm.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )

  /* ── Event type labels ─────────────────────────────── */
  const typeLabels = {
    brute_force: 'Brute Force', sql_injection: 'SQL Injection', xss: 'XSS Attack',
    suspicious_login: 'Suspicious Login', rate_limit: 'Rate Limit', port_scan: 'Port Scan',
    token_abuse: 'Token Abuse', data_scraping: 'Data Scraping', privilege_escalation: 'Privilege Escalation',
    phishing: 'Phishing', password_spray: 'Password Spray', api_abuse: 'API Abuse',
    ddos: 'DDoS Attack', cert_warning: 'Certificate', dependency_vuln: 'Dependency Vuln',
    failed_2fa: 'Failed 2FA',
  }

  const statusBadge = (st) => {
    const m = {
      blocked: { color: '#e74c3c', bg: 'rgba(231,76,60,.1)' },
      mitigated: { color: '#27ae60', bg: 'rgba(46,204,113,.1)' },
      throttled: { color: '#f39c12', bg: 'rgba(243,156,18,.1)' },
      flagged: { color: '#e67e22', bg: 'rgba(230,126,34,.1)' },
      monitoring: { color: '#3498db', bg: 'rgba(52,152,219,.1)' },
      allowed: { color: '#95a5a6', bg: 'rgba(149,165,166,.1)' },
      patched: { color: '#27ae60', bg: 'rgba(46,204,113,.1)' },
      escalated: { color: '#8e44ad', bg: 'rgba(155,89,182,.1)' },
    }
    const s = m[st] || m.monitoring
    return <span className="sad-sec-status" style={{ color: s.color, background: s.bg }}>{st}</span>
  }

  const timeAgo = (iso) => {
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`
    return `${Math.round(ms / 86400000)}d ago`
  }

  /* ── Tab: Security ──────────────────────────────────── */
  const renderSecurity = () => (
    <>
      {/* Threat overview KPIs */}
      <div className="sad-kpis">
        <div className="sad-kpi">
          <div className="sad-kpi-icon" style={{ background: secAnalytics.threatScore > 60 ? 'rgba(231,76,60,.12)' : secAnalytics.threatScore > 30 ? 'rgba(243,156,18,.12)' : 'rgba(46,204,113,.12)', color: secAnalytics.threatScore > 60 ? '#e74c3c' : secAnalytics.threatScore > 30 ? '#f39c12' : '#27ae60' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{secAnalytics.threatScore}<span style={{ fontSize: 14, color: '#888' }}>/100</span></div>
            <div className="sad-kpi-label">Threat Score</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon rose">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value" style={{ color: '#e74c3c' }}>{secAnalytics.critical}</div>
            <div className="sad-kpi-label">Critical Events</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon orange">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value" style={{ color: '#e67e22' }}>{secAnalytics.high}</div>
            <div className="sad-kpi-label">High Severity</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{secAnalytics.blocked}</div>
            <div className="sad-kpi-label">Attacks Blocked</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon teal">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{secAnalytics.last24h}</div>
            <div className="sad-kpi-label">Last 24h Events</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{blockedIps.length}</div>
            <div className="sad-kpi-label">IPs Blocked</div>
          </div>
        </div>
      </div>

      {/* Two-column: Threat breakdown + Attacker origins */}
      <div className="sad-charts-row">
        <div className="sad-widget">
          <h3 className="sad-widget-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2"/></svg>
            Threat Breakdown
          </h3>
          <MiniBarChart
            items={Object.entries(secAnalytics.typeCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => ({
                label: typeLabels[type] || type,
                value: count,
                color: count >= 3 ? '#e74c3c' : count >= 2 ? '#e67e22' : '#3498db',
              }))}
          />
        </div>
        <div className="sad-widget">
          <h3 className="sad-widget-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2"/></svg>
            Attacker Origins
          </h3>
          <div className="sad-sec-origins">
            {secAnalytics.countries.map((c) => {
              const count = securityEvents.filter((e) => e.country === c).length
              return (
                <div key={c} className="sad-sec-origin-row">
                  <span className="sad-sec-country">{c}</span>
                  <div className="sad-bar-track" style={{ flex: 1 }}>
                    <div className="sad-bar-fill" style={{ width: `${secAnalytics.total > 0 ? (count / secAnalytics.total) * 100 : 0}%`, background: '#e74c3c' }} />
                  </div>
                  <span className="sad-bar-val">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="sad-widget">
          <h3 className="sad-widget-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/></svg>
            Security Status
          </h3>
          <div className="sad-sec-health">
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>Firewall</span><strong>Active</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>WAF Protection</span><strong>Enabled</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>Rate Limiting</span><strong>Active</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>DDoS Protection</span><strong>CDN + Auto-scale</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#f39c12' }} />
              <span>SSL Certificate</span><strong>Expires in 28d</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>2FA Enforcement</span><strong>Optional</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>JWT Tokens</span><strong>RS256 signed</strong>
            </div>
            <div className="sad-sec-health-item">
              <span className="sad-sec-health-dot" style={{ background: '#27ae60' }} />
              <span>CORS Policy</span><strong>Strict</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Event log filters */}
      <div className="sad-filters">
        <select className="sad-select" value={secFilter} onChange={(e) => setSecFilter(e.target.value)}>
          <option value="all">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="sad-select" value={secTypeFilter} onChange={(e) => setSecTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="sad-filter-count">{filteredSecEvents.length} events</div>
      </div>

      {/* Two-column: Event log + Blocked IPs */}
      <div className="sad-sec-main">
        {/* Event log */}
        <div className="sad-widget sad-sec-log">
          <h3 className="sad-widget-title">Security Event Log</h3>
          <div className="sad-sec-events">
            {filteredSecEvents.map((ev) => {
              const sev = SEVERITY[ev.severity] || SEVERITY.info
              return (
                <div key={ev.id} className="sad-sec-event">
                  <div className="sad-sec-event-header">
                    <span className="sad-sec-sev" style={{ color: sev.color, background: sev.bg }}>{sev.label}</span>
                    <span className="sad-sec-event-type">{typeLabels[ev.type] || ev.type}</span>
                    <span className="sad-sec-event-time">{timeAgo(ev.timestamp)}</span>
                    {statusBadge(ev.status)}
                  </div>
                  <div className="sad-sec-event-desc">{ev.description}</div>
                  <div className="sad-sec-event-meta">
                    {ev.ip && ev.ip !== '—' && <span className="sad-sec-meta-item">IP: <strong>{ev.ip}</strong></span>}
                    {ev.country && ev.country !== '—' && <span className="sad-sec-meta-item">Country: <strong>{ev.country}</strong></span>}
                    <span className="sad-sec-meta-item">Target: <strong>{ev.target}</strong></span>
                  </div>
                  <div className="sad-sec-event-action">
                    <span className="sad-sec-action-text">Action: {ev.action}</span>
                    <div className="sad-sec-event-btns">
                      {ev.status !== 'escalated' && (
                        <button className="sad-sec-btn escalate" onClick={(e) => { e.stopPropagation(); handleEscalateEvent(ev.id) }}>Escalate</button>
                      )}
                      <button className="sad-sec-btn dismiss" onClick={(e) => { e.stopPropagation(); handleDismissEvent(ev.id) }}>Dismiss</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Blocked IPs */}
        <div className="sad-widget sad-sec-ips">
          <h3 className="sad-widget-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2"/></svg>
            Blocked IPs ({blockedIps.length})
          </h3>
          <div className="sad-sec-ip-list">
            {blockedIps.map((ip, i) => (
              <div key={i} className="sad-sec-ip-row">
                <div className="sad-sec-ip-info">
                  <span className="sad-sec-ip-addr">{ip.ip}</span>
                  <span className="sad-sec-ip-country">{ip.country}</span>
                </div>
                <div className="sad-sec-ip-reason">{ip.reason}</div>
                <div className="sad-sec-ip-footer">
                  <span className="sad-sec-ip-date">{fmtDate(ip.blockedAt)}</span>
                  <span className={`sad-sec-ip-type ${ip.permanent ? 'perm' : 'temp'}`}>
                    {ip.permanent ? 'Permanent' : 'Temporary'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════════════
   *  TRANSACTIONS TAB
   * ═══════════════════════════════════════════════════════ */
  const renderTransactions = () => (
    <>
      {/* KPI row */}
      <div className="sad-kpi-row">
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#2e7d32' }}>${totalRevenue.toLocaleString()}</div>
          <div className="sad-kpi-label">Total Revenue</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{allTransactions.length}</div>
          <div className="sad-kpi-label">Total Transactions</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#e67e22' }}>{pendingPayments.length}</div>
          <div className="sad-kpi-label">Pending Payments</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#e65100' }}>{allTransactions.filter((t) => t.status === 'pending_approval').length}</div>
          <div className="sad-kpi-label">Awaiting Approval</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{allTransactions.filter((t) => t.type === 'plan_upgrade').length}</div>
          <div className="sad-kpi-label">Plan Upgrades</div>
        </div>
      </div>

      {/* Transaction table */}
      <div className="sad-section">
        <h3 className="sad-section-title">All Transactions</h3>
        {allTransactions.length === 0 ? (
          <div className="sad-empty">No transactions recorded yet.</div>
        ) : (
          <div className="sad-table-wrap">
            <table className="sad-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Service</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>User</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{tx.invoiceId || tx.id}</td>
                    <td>{tx.date ? fmtDate(tx.date) : '—'}</td>
                    <td>
                      <span className="sad-badge" style={{ background: tx.type === 'plan_upgrade' ? '#e8f5e9' : tx.type === 'plan_downgrade' ? '#fff3e0' : '#e3f2fd', color: tx.type === 'plan_upgrade' ? '#2e7d32' : tx.type === 'plan_downgrade' ? '#e65100' : '#1565c0' }}>
                        {tx.type === 'plan_upgrade' ? 'Upgrade' : tx.type === 'plan_downgrade' ? 'Downgrade' : tx.type === 'service_payment' ? 'Service' : tx.type || '—'}
                      </span>
                    </td>
                    <td>{tx.service || '—'}</td>
                    <td style={{ fontWeight: 600 }}>${(tx.amount || 0).toLocaleString()}</td>
                    <td>{tx.method || '—'}</td>
                    <td>
                      <span className="sad-badge" style={{
                        background: tx.status === 'paid' ? '#e8f5e9' : tx.status === 'pending_approval' ? '#fff3e0' : tx.status === 'pending' ? '#fff3e0' : tx.status === 'rejected' ? '#fce4ec' : '#fce4ec',
                        color: tx.status === 'paid' ? '#2e7d32' : tx.status === 'pending_approval' ? '#e65100' : tx.status === 'pending' ? '#e65100' : tx.status === 'rejected' ? '#c62828' : '#c62828',
                      }}>
                        {tx.status === 'pending_approval' ? 'Awaiting Approval' : tx.status || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{tx.userEmail || '—'}</td>
                    <td style={{ fontSize: 12 }}>{tx.companyName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════════════
   *  SERVICE REQUESTS TAB
   * ═══════════════════════════════════════════════════════ */
  const renderServiceRequests = () => (
    <>
      {/* KPI row */}
      <div className="sad-kpi-row">
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{srStats.total}</div>
          <div className="sad-kpi-label">Total Requests</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#1565c0' }}>{srStats.new}</div>
          <div className="sad-kpi-label">New</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#e65100' }}>{srStats.assigned}</div>
          <div className="sad-kpi-label">Assigned</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#7b1fa2' }}>{srStats.inProgress}</div>
          <div className="sad-kpi-label">In Progress</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#2e7d32' }}>{srStats.completed}</div>
          <div className="sad-kpi-label">Completed</div>
        </div>
      </div>

      <div className="sad-section">
        <h3 className="sad-section-title">All Service Requests</h3>
        {serviceRequests.length === 0 ? (
          <div className="sad-empty">No service requests yet. Requests submitted by users will appear here.</div>
        ) : (
          <div className="sad-two-panel">
            {/* List */}
            <div className="sad-panel-list">
              {serviceRequests.map((r) => {
                const sc = { new: '#1565c0', assigned: '#e65100', in_progress: '#7b1fa2', completed: '#2e7d32', cancelled: '#c62828' }
                return (
                  <div key={r.id} className={`sad-panel-item ${srSelectedRequest?.id === r.id ? 'selected' : ''}`} onClick={() => setSrSelectedRequest(r)}>
                    <div className="sad-panel-item-top">
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>{r.id}</span>
                      <span className="sad-badge" style={{ background: `${sc[r.status]}15`, color: sc[r.status] }}>{r.status}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.companyName || r.contactName}</div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{(r.services || []).join(', ')}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{r.createdAt ? fmtDate(r.createdAt) : ''} · Priority: {r.priority}</div>
                  </div>
                )
              })}
            </div>

            {/* Detail */}
            <div className="sad-panel-detail">
              {!srSelectedRequest ? (
                <div className="sad-empty">Select a request to view details</div>
              ) : (
                <div>
                  <h4 style={{ margin: '0 0 4px' }}>{srSelectedRequest.companyName || srSelectedRequest.contactName}</h4>
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>{srSelectedRequest.id} · {srSelectedRequest.email}</p>

                  <div className="sad-detail-grid">
                    <div><strong>Services:</strong> {(srSelectedRequest.services || []).join(', ')}</div>
                    <div><strong>Industry:</strong> {srSelectedRequest.industryId || '—'}</div>
                    <div><strong>Priority:</strong> {srSelectedRequest.priority}</div>
                    <div><strong>Status:</strong> {srSelectedRequest.status}</div>
                    <div><strong>Assigned To:</strong> {srSelectedRequest.assignedTo || 'Unassigned'}</div>
                    <div><strong>Preferred Date:</strong> {srSelectedRequest.preferredDate || '—'}</div>
                    <div><strong>Phone:</strong> {srSelectedRequest.phone || '—'}</div>
                    <div><strong>Description:</strong> {srSelectedRequest.description || '—'}</div>
                  </div>

                  {/* Assign */}
                  <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      placeholder="Assign to email..."
                      value={srAssignEmail}
                      onChange={(e) => setSrAssignEmail(e.target.value)}
                      style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                    />
                    <button
                      type="button"
                      className="sad-btn-primary"
                      onClick={() => {
                        if (srAssignEmail) {
                          assignRequest(srSelectedRequest.id, srAssignEmail, 'superadmin@strefex.com')
                          setSrSelectedRequest({ ...srSelectedRequest, status: 'assigned', assignedTo: srAssignEmail })
                          setSrAssignEmail('')
                        }
                      }}
                    >
                      Assign
                    </button>
                    <select
                      value={srNewStatus}
                      onChange={(e) => setSrNewStatus(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                    >
                      <option value="">Change Status</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                      type="button"
                      className="sad-btn-secondary"
                      onClick={() => {
                        if (srNewStatus) {
                          updateRequestStatus(srSelectedRequest.id, srNewStatus, null, 'superadmin@strefex.com')
                          setSrSelectedRequest({ ...srSelectedRequest, status: srNewStatus })
                          setSrNewStatus('')
                        }
                      }}
                    >
                      Update
                    </button>
                  </div>

                  {/* Admin notes */}
                  {(srSelectedRequest.adminNotes || []).length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <strong>Admin Notes:</strong>
                      {srSelectedRequest.adminNotes.map((n, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#555', marginTop: 4, padding: '6px 10px', background: '#f5f5f5', borderRadius: 6 }}>
                          {n.text} <span style={{ color: '#999' }}>— {n.by}, {fmtDate(n.at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════════════
   *  ROLES & PERMISSIONS TAB
   * ═══════════════════════════════════════════════════════ */
  const ROLE_HIERARCHY = [
    { id: 'superadmin', label: 'Super Admin', color: '#e74c3c', desc: '100% rights — can see everything, change everything. Handles developers, admins, managers.' },
    { id: 'auditor_external', label: 'Auditor (External)', color: '#8e44ad', desc: 'Read-only cross-company access for external auditing, compliance reviews, and certification bodies.' },
    { id: 'admin', label: 'Admin', color: '#e67e22', desc: 'Manages team accounts, approves registrations, handles service requests, manages billing.' },
    { id: 'auditor_internal', label: 'Auditor (Internal)', color: '#9b59b6', desc: 'Read-only access to all company data for internal auditing and compliance checks.' },
    { id: 'manager', label: 'Manager', color: '#000888', desc: 'Manages service requests, handles assigned tasks, oversees users within their scope.' },
    { id: 'user', label: 'User', color: '#2e7d32', desc: 'Standard platform user with plan-based access to features.' },
  ]

  // Build a combined list of all platform users from account registry for role management
  const allPlatformUsers = useMemo(() => {
    const users = []
    registryAccounts.forEach((acct) => {
      // Primary account holder
      users.push({
        id: acct.id,
        email: acct.email,
        name: acct.contactName || acct.company,
        company: acct.company,
        accountType: acct.accountType,
        plan: acct.plan,
        role: acct.role || 'user',
        status: acct.status,
        registeredAt: acct.registeredAt,
      })
      // Team members
      if (acct.teamMembers) {
        acct.teamMembers.forEach((tm) => {
          users.push({
            id: tm.id,
            email: tm.email,
            name: tm.name,
            company: acct.company,
            accountType: acct.accountType,
            plan: acct.plan,
            role: tm.role || 'user',
            status: tm.status || 'active',
            registeredAt: tm.invitedAt || acct.registeredAt,
            parentAccountEmail: acct.email,
          })
        })
      }
    })
    return users
  }, [registryAccounts])

  const filteredRoleUsers = useMemo(() => {
    return allPlatformUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (roleSearch) {
        const q = roleSearch.toLowerCase()
        return (
          (u.email || '').toLowerCase().includes(q) ||
          (u.name || '').toLowerCase().includes(q) ||
          (u.company || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [allPlatformUsers, roleFilter, roleSearch])

  const handleChangeRole = (userEmail, newRole) => {
    const currentRole = useAuthStore.getState().role
    // Only an existing superadmin can assign superadmin to another user
    if (newRole === 'superadmin' && !canAssignSuperadmin(currentRole)) {
      alert('Only an existing superadmin can assign superadmin rights to another account.')
      return
    }
    // Update in account registry
    const acct = registryAccounts.find((a) => a.email === userEmail)
    if (acct) {
      updateRegistryAccount(userEmail, { role: newRole })
    } else {
      // Try as team member
      registryAccounts.forEach((a) => {
        if (a.teamMembers) {
          const tm = a.teamMembers.find((m) => m.email === userEmail)
          if (tm) {
            const updated = a.teamMembers.map((m) =>
              m.email === userEmail ? { ...m, role: newRole } : m
            )
            updateRegistryAccount(a.email, { teamMembers: updated })
          }
        }
      })
    }
    if (selectedRoleUser?.email === userEmail) {
      setSelectedRoleUser({ ...selectedRoleUser, role: newRole })
    }
  }

  const renderRoles = () => (
    <>
      {/* Role hierarchy info */}
      <div className="sad-section">
        <h3 className="sad-section-title">Role Hierarchy & Permissions</h3>
        <div className="sad-kpi-row">
          {ROLE_HIERARCHY.map((r) => {
            const count = allPlatformUsers.filter((u) => u.role === r.id).length
            return (
              <div key={r.id} className="sad-kpi-card" style={{ borderTop: `3px solid ${r.color}` }}>
                <div className="sad-kpi-val" style={{ color: r.color }}>{count}</div>
                <div className="sad-kpi-label">{r.label}s</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.4 }}>{r.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* User list with role management */}
      <div className="sad-section">
        <h3 className="sad-section-title">Manage User Roles</h3>
        <div className="sad-filter-row">
          <input
            type="text"
            placeholder="Search by email, name, or company..."
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
            className="sad-search"
          />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="sad-filter-select">
            <option value="all">All Roles</option>
            <option value="superadmin">Super Admin</option>
            <option value="auditor_external">Auditor (External)</option>
            <option value="admin">Admin</option>
            <option value="auditor_internal">Auditor (Internal)</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
          </select>
        </div>

        <div className="sad-table-wrap">
          <table className="sad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Account Type</th>
                <th>Plan</th>
                <th>Current Role</th>
                <th>Change Role</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoleUsers.slice(0, 50).map((u) => {
                const roleObj = ROLE_HIERARCHY.find((r) => r.id === u.role) || ROLE_HIERARCHY[3]
                return (
                  <tr key={u.id || u.email}>
                    <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{u.email}</td>
                    <td style={{ fontSize: 12 }}>{u.company || '—'}</td>
                    <td>
                      <span className="sad-badge" style={{ background: u.accountType === 'buyer' ? '#e3f2fd' : u.accountType === 'seller' ? '#e8f5e9' : '#f3e5f5', color: u.accountType === 'buyer' ? '#1565c0' : u.accountType === 'seller' ? '#2e7d32' : '#7b1fa2' }}>
                        {u.accountType}
                      </span>
                    </td>
                    <td><span className="sad-badge" style={{ background: `${planColor(u.plan)}20`, color: planColor(u.plan) }}>{u.plan}</span></td>
                    <td><span className="sad-badge" style={{ background: `${roleObj.color}15`, color: roleObj.color, fontWeight: 700 }}>{roleObj.label}</span></td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.email, e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                        <option value="auditor_internal">Auditor (Internal)</option>
                        <option value="admin">Admin</option>
                        <option value="auditor_external">Auditor (External)</option>
                        <option value="superadmin">Super Admin</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredRoleUsers.length === 0 && <div className="sad-empty">No users match the current filters.</div>}
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════════════
   *  RFQ ANALYTICS TAB
   * ═══════════════════════════════════════════════════════ */
  const rfqAnalytics = useMemo(() => {
    // Group buyer RFQs by company
    const byCompany = {}
    allBuyerRfqs.forEach((rfq) => {
      const company = rfq.buyerCompany || 'Unknown'
      if (!byCompany[company]) {
        byCompany[company] = { company, email: rfq.buyerEmail || '', rfqs: [], totalSent: 0, totalResponses: 0, totalSuppliers: 0 }
      }
      byCompany[company].rfqs.push(rfq)
      if (rfq.status !== 'draft') byCompany[company].totalSent++
      byCompany[company].totalResponses += (rfq.sellerResponses || []).length
      byCompany[company].totalSuppliers += (rfq.suppliers || []).length
    })
    const companies = Object.values(byCompany).sort((a, b) => b.rfqs.length - a.rfqs.length)

    // Overall stats
    const totalRfqs = allBuyerRfqs.length
    const totalSent = allBuyerRfqs.filter(r => r.status !== 'draft').length
    const totalResponses = allBuyerRfqs.reduce((s, r) => s + (r.sellerResponses || []).length, 0)
    const totalDrafts = allBuyerRfqs.filter(r => r.status === 'draft').length
    const avgResponseRate = totalSent > 0 ? Math.round((totalResponses / totalSent) * 100) / 100 : 0
    const uniqueBuyers = companies.length

    // Received RFQs stats (seller side)
    const totalReceived = allReceivedRfqs.length
    const pendingSeller = allReceivedRfqs.filter(r => r.status === 'pending').length
    const respondedSeller = allReceivedRfqs.filter(r => r.status === 'responded').length
    const awardedSeller = allReceivedRfqs.filter(r => r.status === 'awarded').length

    return { companies, totalRfqs, totalSent, totalResponses, totalDrafts, avgResponseRate, uniqueBuyers, totalReceived, pendingSeller, respondedSeller, awardedSeller }
  }, [allBuyerRfqs, allReceivedRfqs])

  const renderRfqAnalytics = () => (
    <>
      {/* KPI row */}
      <div className="sad-kpis">
        <div className="sad-kpi">
          <div className="sad-kpi-icon blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{rfqAnalytics.totalRfqs}</div>
            <div className="sad-kpi-label">Total RFQs</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{rfqAnalytics.totalSent}</div>
            <div className="sad-kpi-label">Sent to Suppliers</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{rfqAnalytics.totalResponses}</div>
            <div className="sad-kpi-label">Seller Responses</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon orange">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{rfqAnalytics.uniqueBuyers}</div>
            <div className="sad-kpi-label">Buyer Companies</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon teal">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{rfqAnalytics.avgResponseRate}</div>
            <div className="sad-kpi-label">Avg Responses/RFQ</div>
          </div>
        </div>
        <div className="sad-kpi">
          <div className="sad-kpi-icon rose">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/></svg>
          </div>
          <div className="sad-kpi-body">
            <div className="sad-kpi-value">{rfqAnalytics.awardedSeller}</div>
            <div className="sad-kpi-label">Awarded</div>
          </div>
        </div>
      </div>

      {/* Two panels: Company list + RFQ detail / comparison */}
      <div className="sad-section">
        <h3 className="sad-section-title">RFQs by Buyer Company</h3>
        <div className="sad-two-panel">
          {/* Company list */}
          <div className="sad-panel-list">
            {rfqAnalytics.companies.length === 0 && <div className="sad-empty">No RFQs recorded yet.</div>}
            {rfqAnalytics.companies.map((c) => (
              <div
                key={c.company}
                className={`sad-panel-item ${selectedRfqCompany === c.company ? 'selected' : ''}`}
                onClick={() => { setSelectedRfqCompany(c.company); setSelectedRfqDetail(null) }}
              >
                <div className="sad-panel-item-top">
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>{c.company}</span>
                  <span className="sad-badge" style={{ background: '#e3f2fd', color: '#1565c0' }}>{c.rfqs.length} RFQs</span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{c.email}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888', marginTop: 6 }}>
                  <span>Sent: <strong style={{ color: '#333' }}>{c.totalSent}</strong></span>
                  <span>Responses: <strong style={{ color: '#2e7d32' }}>{c.totalResponses}</strong></span>
                  <span>Suppliers: <strong style={{ color: '#000888' }}>{c.totalSuppliers}</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* Detail: RFQ list for selected company + comparison */}
          <div className="sad-panel-detail">
            {!selectedRfqCompany ? (
              <div className="sad-empty">Select a buyer company to view their RFQs and seller responses</div>
            ) : (
              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 16 }}>
                  {selectedRfqCompany} — RFQs
                </h4>

                {/* RFQ list for the company */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {rfqAnalytics.companies
                    .find((c) => c.company === selectedRfqCompany)?.rfqs
                    .map((rfq) => {
                      const respCount = (rfq.sellerResponses || []).length
                      const isSelected = selectedRfqDetail?.id === rfq.id
                      const sc = { draft: '#888', sent: '#000888', active: '#e65100', completed: '#2e7d32' }
                      return (
                        <button
                          key={rfq.id}
                          type="button"
                          onClick={() => setSelectedRfqDetail(isSelected ? null : rfq)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', borderRadius: 10,
                            border: isSelected ? '2px solid #000888' : '1px solid #e8eaed',
                            background: isSelected ? 'rgba(0,8,136,.03)' : '#fff',
                            cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all .15s',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{rfq.title}</div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                              {rfq.industryId} · Due: {rfq.dueDate} · Sent to {(rfq.suppliers || []).length} suppliers
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span className="sad-badge" style={{ background: `${sc[rfq.status] || '#888'}15`, color: sc[rfq.status] || '#888' }}>
                              {rfq.status}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: respCount > 0 ? '#2e7d32' : '#ccc' }}>
                              {respCount} resp.
                            </span>
                          </div>
                        </button>
                      )
                    })}
                </div>

                {/* Seller Comparison for selected RFQ */}
                {selectedRfqDetail && (
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: 15, borderTop: '1px solid #e8eaed', paddingTop: 16 }}>
                      Seller Comparison — {selectedRfqDetail.title}
                    </h4>

                    {(selectedRfqDetail.sellerResponses || []).length === 0 ? (
                      <div className="sad-empty" style={{ padding: '20px 0' }}>No seller responses for this RFQ yet.</div>
                    ) : (
                      <div className="sad-table-wrap">
                        <table className="sad-table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>Seller</th>
                              <th>Email</th>
                              <th>Price</th>
                              <th>Lead Time</th>
                              <th>Rating</th>
                              <th>Certifications</th>
                              <th>Capacity</th>
                              <th>Warranty</th>
                              <th>Responded</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const responses = selectedRfqDetail.sellerResponses || []
                              const bestPrice = Math.min(...responses.map(r => r.price || Infinity))
                              const bestLead = Math.min(...responses.map(r => r.leadTime || Infinity))
                              const bestRating = Math.max(...responses.map(r => r.rating || 0))
                              return responses.map((r) => (
                                <tr key={r.sellerId}>
                                  <td style={{ fontWeight: 600 }}>{r.sellerName}</td>
                                  <td style={{ color: '#888' }}>{r.sellerEmail}</td>
                                  <td style={{ fontWeight: 700, color: r.price === bestPrice ? '#2e7d32' : '#333' }}>
                                    ${r.price?.toLocaleString()}
                                    {r.price === bestPrice && <span style={{ marginLeft: 4, fontSize: 10, color: '#2e7d32', fontWeight: 700 }}>✓ Best</span>}
                                  </td>
                                  <td style={{ color: r.leadTime === bestLead ? '#2e7d32' : '#333', fontWeight: r.leadTime === bestLead ? 700 : 400 }}>
                                    {r.leadTime}d
                                    {r.leadTime === bestLead && <span style={{ marginLeft: 4, fontSize: 10, color: '#2e7d32' }}>✓</span>}
                                  </td>
                                  <td style={{ color: r.rating === bestRating ? '#f5a623' : '#333', fontWeight: r.rating === bestRating ? 700 : 400 }}>
                                    {r.rating?.toFixed(1)} ★
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                      {(r.certifications || []).map((c, i) => (
                                        <span key={i} className="sad-badge" style={{ background: 'rgba(0,8,136,.06)', color: '#000888', fontSize: 10, padding: '1px 6px' }}>{c}</span>
                                      ))}
                                    </div>
                                  </td>
                                  <td>
                                    <span style={{ color: r.capacity === 'Available' ? '#2e7d32' : '#e65100', fontWeight: 600, fontSize: 11 }}>{r.capacity}</span>
                                  </td>
                                  <td>{r.warranty}</td>
                                  <td style={{ color: '#888' }}>{r.respondedAt}</td>
                                  <td style={{ maxWidth: 180, fontSize: 11, color: '#666', lineHeight: 1.4 }}>{r.notes}</td>
                                </tr>
                              ))
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Received RFQs overview (seller side) */}
      <div className="sad-section">
        <h3 className="sad-section-title">Seller-Side: Received RFQs Overview</h3>
        <div className="sad-kpi-row">
          <div className="sad-kpi-card">
            <div className="sad-kpi-val">{rfqAnalytics.totalReceived}</div>
            <div className="sad-kpi-label">Total Received</div>
          </div>
          <div className="sad-kpi-card">
            <div className="sad-kpi-val" style={{ color: '#e65100' }}>{rfqAnalytics.pendingSeller}</div>
            <div className="sad-kpi-label">Pending Response</div>
          </div>
          <div className="sad-kpi-card">
            <div className="sad-kpi-val" style={{ color: '#2e7d32' }}>{rfqAnalytics.respondedSeller}</div>
            <div className="sad-kpi-label">Responded</div>
          </div>
          <div className="sad-kpi-card">
            <div className="sad-kpi-val" style={{ color: '#000888' }}>{rfqAnalytics.awardedSeller}</div>
            <div className="sad-kpi-label">Awarded</div>
          </div>
        </div>

        {allReceivedRfqs.length > 0 && (
          <div className="sad-table-wrap" style={{ marginTop: 12 }}>
            <table className="sad-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>RFQ Title</th>
                  <th>Buyer Company</th>
                  <th>Industry</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th>Due</th>
                  <th>Response Price</th>
                  <th>Response Lead</th>
                </tr>
              </thead>
              <tbody>
                {allReceivedRfqs.map((r) => {
                  const sc = { pending: '#e65100', responded: '#2e7d32', awarded: '#000888', declined: '#c62828' }
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.title}</td>
                      <td>{r.buyerCompany}</td>
                      <td>{r.industryId}</td>
                      <td>
                        <span className="sad-badge" style={{ background: `${sc[r.status] || '#888'}15`, color: sc[r.status] || '#888' }}>{r.status}</span>
                      </td>
                      <td>{r.receivedAt}</td>
                      <td>{r.dueDate}</td>
                      <td>{r.myResponse ? `$${r.myResponse.price?.toLocaleString()}` : '—'}</td>
                      <td>{r.myResponse ? `${r.myResponse.leadTime}d` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  /* ══════════════════════════════════════════════════════
   *  FEATURE GRANTS TAB
   * ══════════════════════════════════════════════════════ */
  const renderFeatureGrants = () => (
    <>
      {grantFeedback && (
        <div className="sad-section" style={{ background: '#e8f5e9', borderRadius: 10, padding: '12px 20px', color: '#2e7d32', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
          {grantFeedback}
        </div>
      )}

      {/* KPIs */}
      <div className="sad-kpi-row">
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{activeGrants.length}</div>
          <div className="sad-kpi-label">Active Grants</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#888' }}>{expiredGrants.length}</div>
          <div className="sad-kpi-label">Expired</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#000888' }}>{new Set(activeGrants.map((g) => g.accountId)).size}</div>
          <div className="sad-kpi-label">Companies with Grants</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val" style={{ color: '#8e44ad' }}>{new Set(activeGrants.map((g) => g.featureKey)).size}</div>
          <div className="sad-kpi-label">Unique Features Granted</div>
        </div>
      </div>

      {/* Grant form */}
      <div className="sad-section">
        <h3 className="sad-section-title">Grant Feature Access</h3>
        <div className="fg-form">
          {/* Step 1: Select company */}
          <div className="fg-form-row">
            <label className="fg-label">
              <span className="fg-step">1</span>
              Select Company
            </label>
            <select
              className="fg-select"
              value={grantCompany}
              onChange={(e) => { setGrantCompany(e.target.value); setGrantFeatures([]) }}
            >
              <option value="">— Choose a company —</option>
              {accounts
                .filter((a) => a.status !== 'canceled')
                .sort((a, b) => a.company.localeCompare(b.company))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company} — {a.accountType === 'service_provider' ? 'Service Provider' : a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)} — {(PLANS.find((p) => p.id === a.plan)?.name || a.plan)} plan
                  </option>
                ))}
            </select>
          </div>

          {/* Selected company info */}
          {selectedGrantAccount && (
            <div className="fg-account-info">
              <div className="fg-account-detail">
                <strong>{selectedGrantAccount.company}</strong>
                <span className="fg-account-meta">
                  {selectedGrantAccount.email} &middot;{' '}
                  <span style={{ textTransform: 'capitalize' }}>{selectedGrantAccount.accountType === 'service_provider' ? 'Service Provider' : selectedGrantAccount.accountType}</span> &middot;{' '}
                  <span className="fg-plan-badge" style={{ background: planColor(selectedGrantAccount.plan), color: '#fff' }}>
                    {PLANS.find((p) => p.id === selectedGrantAccount.plan)?.name || selectedGrantAccount.plan}
                  </span>
                </span>
              </div>
              {/* Existing grants for this company */}
              {activeGrants.filter((g) => g.accountId === selectedGrantAccount.id).length > 0 && (
                <div className="fg-existing">
                  <span className="fg-existing-label">Active grants:</span>
                  {activeGrants.filter((g) => g.accountId === selectedGrantAccount.id).map((g) => (
                    <span key={g.id} className="fg-existing-tag">{g.featureLabel}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select features */}
          {selectedGrantAccount && (
            <div className="fg-form-row">
              <label className="fg-label">
                <span className="fg-step">2</span>
                Select Features to Grant
                <span className="fg-hint">Only features above the current plan are shown</span>
              </label>
              {availableGrantFeatures.length === 0 ? (
                <div className="fg-empty-msg">This account is on the Enterprise plan — all features are already included.</div>
              ) : (
                <div className="fg-feature-grid">
                  {availableGrantFeatures.map((feat) => {
                    const isSelected = grantFeatures.includes(feat.key)
                    const alreadyGranted = activeGrants.some((g) => g.accountId === selectedGrantAccount.id && g.featureKey === feat.key)
                    return (
                      <button
                        key={feat.key}
                        type="button"
                        className={`fg-feature-btn ${isSelected ? 'selected' : ''} ${alreadyGranted ? 'already-granted' : ''}`}
                        onClick={() => {
                          if (alreadyGranted) return
                          setGrantFeatures((prev) =>
                            isSelected ? prev.filter((k) => k !== feat.key) : [...prev, feat.key]
                          )
                        }}
                        disabled={alreadyGranted}
                      >
                        <span className="fg-feature-check">
                          {isSelected ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#2e7d32"/><path d="M7 12l4 4 6-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : alreadyGranted ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#ccc"/><path d="M7 12l4 4 6-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#ccc" strokeWidth="2"/></svg>
                          )}
                        </span>
                        <span className="fg-feature-info">
                          <span className="fg-feature-name">{feat.label}</span>
                          <span className="fg-feature-tier" style={{ color: planColor(feat.tierLabel.toLowerCase()) }}>{feat.tierLabel} feature</span>
                        </span>
                        {alreadyGranted && <span className="fg-already-badge">Already granted</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select period */}
          {selectedGrantAccount && grantFeatures.length > 0 && (
            <div className="fg-form-row">
              <label className="fg-label">
                <span className="fg-step">3</span>
                Grant Period
              </label>
              <div className="fg-period-grid">
                {GRANT_PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`fg-period-btn ${grantPeriod === p.value ? 'selected' : ''}`}
                    onClick={() => setGrantPeriod(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          {selectedGrantAccount && grantFeatures.length > 0 && (
            <div className="fg-form-row" style={{ borderTop: '1px solid #e5e8ec', paddingTop: 20, marginTop: 8 }}>
              <div className="fg-summary">
                <strong>Summary:</strong> Granting <strong>{grantFeatures.length}</strong> feature(s) to{' '}
                <strong>{selectedGrantAccount.company}</strong> for{' '}
                <strong>{grantPeriod === 0 ? 'unlimited time' : GRANT_PERIODS.find((p) => p.value === grantPeriod)?.label}</strong>
              </div>
              <button type="button" className="fg-submit-btn" onClick={handleGrantFeature}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Grant Features
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active grants table */}
      <div className="sad-section">
        <h3 className="sad-section-title">Active Feature Grants ({activeGrants.length})</h3>
        {activeGrants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#888', fontSize: 14 }}>No active feature grants yet.</div>
        ) : (
          <div className="sad-table-wrap">
            <table className="sad-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Current Plan</th>
                  <th>Granted Feature</th>
                  <th>Granted</th>
                  <th>Expires</th>
                  <th>Remaining</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeGrants.sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt)).map((g) => {
                  const remaining = g.expiresAt ? daysUntil(g.expiresAt) : null
                  return (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.company}</td>
                      <td><span style={{ textTransform: 'capitalize', fontSize: 12 }}>{g.accountType === 'service_provider' ? 'Service' : g.accountType}</span></td>
                      <td><span className="fg-plan-badge" style={{ background: planColor(g.plan), color: '#fff' }}>{PLANS.find((p) => p.id === g.plan)?.name || g.plan}</span></td>
                      <td><strong>{g.featureLabel}</strong></td>
                      <td>{fmtDate(g.grantedAt)}</td>
                      <td>{g.expiresAt ? fmtDate(g.expiresAt) : <span style={{ color: '#2e7d32', fontWeight: 600 }}>Unlimited</span>}</td>
                      <td>
                        {remaining === null ? (
                          <span style={{ color: '#2e7d32' }}>No limit</span>
                        ) : remaining <= 7 ? (
                          <span style={{ color: '#e74c3c', fontWeight: 600 }}>{remaining}d</span>
                        ) : (
                          <span>{remaining}d</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="fg-action-btn extend" onClick={() => handleExtendGrant(g.id, 30)} title="Extend by 30 days">+30d</button>
                          <button type="button" className="fg-action-btn extend" onClick={() => handleExtendGrant(g.id, 90)} title="Extend by 90 days">+90d</button>
                          <button type="button" className="fg-action-btn revoke" onClick={() => handleRevokeGrant(g.id)} title="Revoke grant">Revoke</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expired grants */}
      {expiredGrants.length > 0 && (
        <div className="sad-section">
          <h3 className="sad-section-title" style={{ color: '#888' }}>Expired Grants ({expiredGrants.length})</h3>
          <div className="sad-table-wrap">
            <table className="sad-table" style={{ fontSize: 12, opacity: 0.7 }}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Feature</th>
                  <th>Granted</th>
                  <th>Expired</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {expiredGrants.sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt)).map((g) => (
                  <tr key={g.id}>
                    <td>{g.company}</td>
                    <td>{g.featureLabel}</td>
                    <td>{fmtDate(g.grantedAt)}</td>
                    <td style={{ color: '#e74c3c' }}>{fmtDate(g.expiresAt)}</td>
                    <td>
                      <button type="button" className="fg-action-btn extend" onClick={() => handleExtendGrant(g.id, 30)}>Re-grant 30d</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )

  /* ═══════════════════════════════════════════════════════
   *  AUDIT LOG TAB — System-wide audit trail
   * ═══════════════════════════════════════════════════════ */
  const auditLogs = useAuditStore((s) => s.logs)
  const auditStats = useAuditStore((s) => s.stats)
  const [auditModuleFilter, setAuditModuleFilter] = useState('all')
  const [auditSevFilter, setAuditSevFilter] = useState('all')
  const [auditSearch, setAuditSearch] = useState('')

  const renderAuditLog = () => {
    const stats = auditStats()
    let filtered = auditLogs
    if (auditModuleFilter !== 'all') filtered = filtered.filter((l) => l.module === auditModuleFilter)
    if (auditSevFilter !== 'all') filtered = filtered.filter((l) => l.severity === auditSevFilter)
    if (auditSearch) {
      const q = auditSearch.toLowerCase()
      filtered = filtered.filter((l) => l.description.toLowerCase().includes(q) || l.user.toLowerCase().includes(q) || l.entity.toLowerCase().includes(q))
    }
    const sevColors = { info: '#2980b9', warning: '#e67e22', critical: '#e74c3c' }
    return (
      <>
        <div className="sad-kpis" style={{ marginBottom: 16 }}>
          <div className="sad-kpi-card"><div className="sad-kpi-number">{stats.total}</div><div className="sad-kpi-label">Total Events</div></div>
          <div className="sad-kpi-card"><div className="sad-kpi-number">{stats.today}</div><div className="sad-kpi-label">Today</div></div>
          <div className="sad-kpi-card"><div className="sad-kpi-number" style={{ color: '#e74c3c' }}>{stats.critical}</div><div className="sad-kpi-label">Critical</div></div>
          <div className="sad-kpi-card"><div className="sad-kpi-number" style={{ color: '#e67e22' }}>{stats.warnings}</div><div className="sad-kpi-label">Warnings</div></div>
          <div className="sad-kpi-card"><div className="sad-kpi-number">{stats.uniqueUsers}</div><div className="sad-kpi-label">Users</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input placeholder="Search logs..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 12, minWidth: 180 }} />
          <select value={auditModuleFilter} onChange={(e) => setAuditModuleFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 12 }}>
            <option value="all">All Modules</option>
            {AUDIT_MODULES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
          <select value={auditSevFilter} onChange={(e) => setAuditSevFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 12 }}>
            <option value="all">All Severities</option>
            {AUDIT_SEVERITIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="sad-section" style={{ overflowX: 'auto' }}>
          <table className="sad-table" style={{ fontSize: 12 }}>
            <thead>
              <tr><th>Time</th><th>Severity</th><th>User</th><th>Module</th><th>Action</th><th>Entity</th><th>Description</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{new Date(l.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span style={{ color: sevColors[l.severity] || '#888', fontWeight: 800, fontSize: 10, textTransform: 'uppercase' }}>{l.severity}</span></td>
                  <td style={{ fontWeight: 600 }}>{l.user}</td>
                  <td><span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'rgba(0,8,136,.06)', color: '#000888' }}>{l.module}</span></td>
                  <td style={{ fontSize: 11 }}>{l.action.replace(/_/g, ' ')}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#000888' }}>{l.entity}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>No audit logs match filters.</p>}
        </div>
      </>
    )
  }

  /* ── Trial Management handlers ─────────────────────────── */
  const handleExtendTrial = () => {
    if (!trialTargetCompany) return
    const acct = [...accounts, ...registryAccounts].find((a) => a.id === trialTargetCompany)
    if (!acct) return

    const now = new Date()
    const grant = {
      id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      accountId: acct.id,
      company: acct.company,
      email: acct.email,
      accountType: acct.accountType || 'buyer',
      type: 'trial_extension',
      extraDays: trialExtendDays,
      grantedAt: now.toISOString(),
      newExpiresAt: new Date(now.getTime() + trialExtendDays * 86400000).toISOString(),
      grantedBy: 'superadmin',
    }

    const updated = [...trialGrants, grant]
    setTrialGrants(updated)
    saveTrialGrants(updated)
    setTrialFeedback(`Trial extended by ${trialExtendDays} days for ${acct.company || acct.email}`)
    setTimeout(() => setTrialFeedback(''), 4000)
  }

  const handleApplyPromo = () => {
    if (!trialTargetCompany || !trialPromoCode.trim()) return
    const normalized = trialPromoCode.trim().toUpperCase()
    const promo = PROMO_CODES[normalized]
    if (!promo) {
      setTrialFeedback(`Invalid promo code: ${normalized}`)
      setTimeout(() => setTrialFeedback(''), 4000)
      return
    }

    const acct = [...accounts, ...registryAccounts].find((a) => a.id === trialTargetCompany)
    if (!acct) return

    const now = new Date()
    const grant = {
      id: `promo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      accountId: acct.id,
      company: acct.company,
      email: acct.email,
      accountType: acct.accountType || 'buyer',
      type: 'promo_code',
      promoCode: normalized,
      planId: promo.planId,
      trialDays: promo.trialDays,
      description: promo.description,
      grantedAt: now.toISOString(),
      newExpiresAt: new Date(now.getTime() + promo.trialDays * 86400000).toISOString(),
      grantedBy: 'superadmin',
    }

    const updated = [...trialGrants, grant]
    setTrialGrants(updated)
    saveTrialGrants(updated)
    setTrialPromoCode('')
    setTrialFeedback(`Promo "${normalized}" applied to ${acct.company || acct.email} — ${promo.description}`)
    setTimeout(() => setTrialFeedback(''), 5000)
  }

  const renderTrialManagement = () => (
    <>
      {trialFeedback && (
        <div className="sad-section" style={{ background: trialFeedback.startsWith('Invalid') ? '#fdecea' : '#e8f5e9', borderRadius: 10, padding: '12px 20px', color: trialFeedback.startsWith('Invalid') ? '#c62828' : '#2e7d32', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
          {trialFeedback}
        </div>
      )}

      {/* Info */}
      <div className="sad-section" style={{ background: 'rgba(0,8,136,.04)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#444', lineHeight: 1.6 }}>
          <strong>Buyer Trial Policy:</strong> New buyer accounts receive a free <strong>{BUYER_TRIAL_DAYS}-day trial</strong> of the Basic plan.
          After the trial expires, buyers must subscribe to continue using platform features.
          You can extend trials or apply promo codes below.
        </p>
      </div>

      {/* KPIs */}
      <div className="sad-kpi-row" style={{ marginBottom: 24 }}>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{buyerAccounts.length}</div>
          <div className="sad-kpi-label">Buyer Accounts</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{trialGrants.filter((g) => g.type === 'trial_extension').length}</div>
          <div className="sad-kpi-label">Trial Extensions</div>
        </div>
        <div className="sad-kpi-card">
          <div className="sad-kpi-val">{trialGrants.filter((g) => g.type === 'promo_code').length}</div>
          <div className="sad-kpi-label">Promo Codes Applied</div>
        </div>
      </div>

      {/* Extend Trial form */}
      <div className="sad-section">
        <h3 className="sad-section-title">Extend Buyer Trial</h3>
        <div className="fg-form">
          <div className="fg-form-row">
            <div className="fg-form-group" style={{ flex: 2 }}>
              <label className="fg-label">Select Buyer Account</label>
              <select className="fg-select" value={trialTargetCompany} onChange={(e) => setTrialTargetCompany(e.target.value)}>
                <option value="">— Select account —</option>
                {buyerAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.company || a.email} ({a.email})</option>
                ))}
              </select>
            </div>
            <div className="fg-form-group" style={{ flex: 1 }}>
              <label className="fg-label">Extend By</label>
              <select className="fg-select" value={trialExtendDays} onChange={(e) => setTrialExtendDays(Number(e.target.value))}>
                {EXTEND_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="fg-form-group" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="fg-grant-btn"
                onClick={handleExtendTrial}
                disabled={!trialTargetCompany}
              >
                Extend Trial
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Apply Promo Code */}
      <div className="sad-section">
        <h3 className="sad-section-title">Apply Promo Code</h3>
        <div className="fg-form">
          <div className="fg-form-row">
            <div className="fg-form-group" style={{ flex: 2 }}>
              <label className="fg-label">Select Buyer Account</label>
              <select className="fg-select" value={trialTargetCompany} onChange={(e) => setTrialTargetCompany(e.target.value)}>
                <option value="">— Select account —</option>
                {buyerAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.company || a.email} ({a.email})</option>
                ))}
              </select>
            </div>
            <div className="fg-form-group" style={{ flex: 1 }}>
              <label className="fg-label">Promo Code</label>
              <input
                type="text"
                className="fg-select"
                value={trialPromoCode}
                onChange={(e) => setTrialPromoCode(e.target.value)}
                placeholder="e.g. STREFEX30"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="fg-form-group" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="fg-grant-btn"
                onClick={handleApplyPromo}
                disabled={!trialTargetCompany || !trialPromoCode.trim()}
              >
                Apply Code
              </button>
            </div>
          </div>
        </div>

        {/* Available promo codes reference */}
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>Available Promo Codes</h4>
          <div className="sad-table-wrap">
            <table className="sad-table" style={{ fontSize: 12 }}>
              <thead>
                <tr><th>Code</th><th>Plan</th><th>Duration</th><th>Description</th></tr>
              </thead>
              <tbody>
                {Object.entries(PROMO_CODES).map(([code, cfg]) => (
                  <tr key={code}>
                    <td><code style={{ background: 'rgba(0,8,136,.06)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>{code}</code></td>
                    <td><span style={{ color: planColor(cfg.planId), fontWeight: 700, textTransform: 'capitalize' }}>{cfg.planId}</span></td>
                    <td>{cfg.trialDays} days</td>
                    <td>{cfg.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="sad-section">
        <h3 className="sad-section-title">Trial & Promo History ({trialGrants.length})</h3>
        {trialGrants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#888', fontSize: 14 }}>No trial extensions or promo codes applied yet.</div>
        ) : (
          <div className="sad-table-wrap">
            <table className="sad-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>New Expiry</th>
                </tr>
              </thead>
              <tbody>
                {[...trialGrants].reverse().map((g) => (
                  <tr key={g.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(g.grantedAt)}</td>
                    <td style={{ fontWeight: 600 }}>{g.company || '—'}</td>
                    <td>{g.email}</td>
                    <td>
                      {g.type === 'trial_extension' && (
                        <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          +{g.extraDays} days
                        </span>
                      )}
                      {g.type === 'promo_code' && (
                        <span style={{ background: 'rgba(0,8,136,.08)', color: '#000888', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          Promo: {g.promoCode}
                        </span>
                      )}
                    </td>
                    <td>{g.description || `Extension: ${g.extraDays} days`}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(g.newExpiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  return (
    <AppLayout>
      <div className="sad-page">
        {/* Header */}
        <div className="sad-header">
          <div>
            <h1 className="sad-title">Platform Dashboard</h1>
            <p className="sad-subtitle">STREFEX Platform &mdash; Complete overview of all registered accounts, subscriptions, and activity</p>
          </div>
          <span className="sad-badge-super">Super Admin</span>
        </div>

        {/* Tabs */}
        <div className="sad-tabs">
          <button className={`sad-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg>
            Overview
          </button>
          <button className={`sad-tab ${tab === 'accounts' ? 'active' : ''}`} onClick={() => setTab('accounts')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Accounts ({analytics.total})
          </button>
          <button className={`sad-tab ${tab === 'trials' ? 'active' : ''}`} onClick={() => setTab('trials')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Trials & Promos
            {buyerAccounts.length > 0 && <span className="sad-tab-badge">{buyerAccounts.length}</span>}
          </button>
          <button className={`sad-tab ${tab === 'feature-grants' ? 'active' : ''}`} onClick={() => setTab('feature-grants')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Feature Grants
            {activeGrants.length > 0 && <span className="sad-tab-badge">{activeGrants.length}</span>}
          </button>
          <button className={`sad-tab ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M2 10h20" stroke="currentColor" strokeWidth="2"/></svg>
            Transactions
            {pendingPayments.length > 0 && <span className="sad-tab-badge">{pendingPayments.length}</span>}
          </button>
          <button className={`sad-tab ${tab === 'service-requests' ? 'active' : ''}`} onClick={() => setTab('service-requests')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Service Requests
            {srStats.new > 0 && <span className="sad-tab-badge">{srStats.new}</span>}
          </button>
          <button className={`sad-tab ${tab === 'rfq-analytics' ? 'active' : ''}`} onClick={() => setTab('rfq-analytics')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/><path d="M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            RFQ Analytics
            {rfqAnalytics.totalRfqs > 0 && <span className="sad-tab-badge">{rfqAnalytics.totalRfqs}</span>}
          </button>
          <button className={`sad-tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Roles
          </button>
          <button className={`sad-tab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Security
            {secAnalytics.critical > 0 && <span className="sad-tab-badge">{secAnalytics.critical}</span>}
          </button>
          <button className={`sad-tab ${tab === 'audit-log' ? 'active' : ''}`} onClick={() => setTab('audit-log')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Audit Log
          </button>
        </div>

        {/* Tab content */}
        {tab === 'overview' && renderOverview()}
        {tab === 'accounts' && renderAccounts()}
        {tab === 'trials' && renderTrialManagement()}
        {tab === 'feature-grants' && renderFeatureGrants()}
        {tab === 'transactions' && renderTransactions()}
        {tab === 'service-requests' && renderServiceRequests()}
        {tab === 'rfq-analytics' && renderRfqAnalytics()}
        {tab === 'roles' && renderRoles()}
        {tab === 'security' && renderSecurity()}
        {tab === 'audit-log' && renderAuditLog()}
      </div>
    </AppLayout>
  )
}
