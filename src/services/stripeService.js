/**
 * Stripe service — subscription management and checkout.
 */
import { getStripe, isStripeConfigured } from '../config/stripe'
import env from '../config/env'
import { billingApi } from './api'
import { analytics } from './analytics'

/* ── Tier constants (numeric hierarchy for comparison) ────── */

export const TIERS = { START: 0, BASIC: 1, STANDARD: 2, PREMIUM: 3, ENTERPRISE: 4 }

/* ── Billing period constants ────────────────────────────── */

export const BILLING_PERIODS = {
  MONTHLY:   'monthly',
  ANNUAL:    'annual',     // 15 % discount
  TRIENNIAL: 'triennial',  // 25 % discount (15 % + additional 10 %)
}

export const BILLING_DISCOUNT = {
  [BILLING_PERIODS.MONTHLY]:   0,
  [BILLING_PERIODS.ANNUAL]:    0.15,
  [BILLING_PERIODS.TRIENNIAL]: 0.25,
}

/* ── Plan definitions — 5 tiers ──────────────────────────── */
/*
 * Feature matrix — Seller, Buyer & Service Provider accounts:
 *
 * SELLER (default):
 *   FREE (Start):  1 user, 3 projects, 1 industry, 1 equipment category, 1 GB storage
 *   BASIC:         5 users, 10 projects, all industries, all categories, 5 GB storage
 *   STANDARD:      25 users, 50 projects, executive summary, advanced reports, 50 GB storage
 *   PREMIUM:       Unlimited everything, Cost + Production Management, 100 GB storage / user
 *   ENTERPRISE:    All Premium + Enterprise Mgmt, Procurement, Contracts, Spend Analysis,
 *                  Compliance, AI Insights, ERP Integrations, Templates, Audit Logs, 500 GB / user
 *
 * BUYER (starts from Basic — free 30-day trial, then paid):
 *   BASIC:         5 users, 10 projects, 1 industry, 1 equipment category, 5 GB storage
 *                  New buyers get a FREE 30-day trial at Basic tier.
 *                  Superadmin can extend the trial or grant promo codes.
 *   STANDARD:      25 users, 50 projects, 3 industries, 3 equipment categories, 50 GB storage
 *   PREMIUM:       Unlimited everything, Cost + Production Management, 100 GB storage / user
 *   ENTERPRISE:    All Premium + full buyer suite (Procurement, Contracts, Spend, Compliance,
 *                  AI Insights, ERP, Templates, Audit) + Enterprise Mgmt, 500 GB / user
 *
 * SERVICE PROVIDER (starts from Free):
 *   Same tier progression; Enterprise adds full management suite.
 *
 * Pricing (per month):
 *   Start      — Free
 *   Basic      — $19       | Annual: $16.15/mo (15 % off) | 3-Year: $14.25/mo (25 % off)
 *   Standard   — $45       | Annual: $38.25/mo            | 3-Year: $33.75/mo
 *   Premium    — $250      | Annual: $212.50/mo           | 3-Year: $187.50/mo
 *   Enterprise — $999      | Annual: $849.15/mo           | 3-Year: $749.25/mo
 *
 * NOTE: A single business domain (e.g. @company.com) may register one account
 * per direction: one Seller, one Buyer, and/or one Service Provider.
 * Team members are invited (no separate registration) to avoid duplicates.
 */

export const PLANS = [
  {
    id: 'start',
    name: 'Free',
    tier: TIERS.START,
    price: 0,
    annualPrice: 0,
    triennialPrice: 0,
    interval: 'month',
    sellerOnly: true, // buyers cannot use this plan
    storageGB: 1,
    features: [
      '1 user',
      'Up to 3 projects',
      '1 GB storage',
      'Basic dashboard',
      'Company profile',
      'Community support',
      'Basic visibility — 1 industry, 1 equipment category',
    ],
    limits: {
      maxProjects: 3,
      maxUsers: 1,
      maxAssets: 10,
      maxStorageGB: 1,
      maxIndustries: 1,
      maxCategories: 1,
      maxServiceCategories: 1,
      basicDashboard: true,
      companyProfile: true,
      basicAnalytics: false,
      advancedReports: false,
      customIntegrations: false,
      auditManagement: false,
      costManagement: false,
      productionManagement: false,
      productionStandard: false,
      enterpriseManagement: false,
      teamManagement: false,
      messenger: false,
      profileContacts: false,
      aiInsights: false,
      erpIntegrations: false,
      procurement: false,
      contractManagement: false,
      spendAnalysis: false,
      complianceEsg: false,
      templateLibrary: false,
      auditLogs: false,
      emailSupport: false,
      prioritySupport: false,
      multipleIndustries: false,
      executiveSummary: false,
      projectAuditSchedule: false,
    },
  },
  {
    id: 'basic',
    name: 'Basic',
    tier: TIERS.BASIC,
    price: 19,
    annualPrice: 16.15,      // 15 % off $19
    triennialPrice: 14.25,   // 25 % off $19
    interval: 'month',
    storageGB: 5,
    features: [
      '5 users — Team',
      'Up to 10 projects',
      '5 GB storage',
      'Basic analytics & reports',
      'Email support',
      'Multiple industries',
      'Company profile',
    ],
    buyerFeatures: [
      '5 users — Team',
      'Up to 10 projects',
      '5 GB storage',
      '1 industry, 1 equipment category',
      'Basic analytics & reports',
      'Email support',
      'Company profile',
    ],
    limits: {
      maxProjects: 10,
      maxUsers: 5,
      maxAssets: 50,
      maxStorageGB: 5,
      maxIndustries: Infinity,
      maxCategories: Infinity,
      maxServiceCategories: Infinity,
      basicDashboard: true,
      companyProfile: true,
      basicAnalytics: true,
      advancedReports: false,
      customIntegrations: false,
      auditManagement: false,
      costManagement: false,
      productionManagement: false,
      productionStandard: false,
      enterpriseManagement: false,
      teamManagement: true,
      messenger: false,
      profileContacts: false,
      aiInsights: false,
      erpIntegrations: false,
      procurement: false,
      contractManagement: false,
      spendAnalysis: false,
      complianceEsg: false,
      templateLibrary: false,
      auditLogs: false,
      emailSupport: true,
      prioritySupport: false,
      multipleIndustries: true,
      executiveSummary: false,
      projectAuditSchedule: false,
    },
  },
  {
    id: 'standard',
    name: 'Standard',
    tier: TIERS.STANDARD,
    price: 45,
    annualPrice: 38.25,      // 15 % off $45
    triennialPrice: 33.75,   // 25 % off $45
    interval: 'month',
    popular: true,
    storageGB: 50,
    features: [
      '25 users — Team',
      'Up to 50 projects',
      '50 GB storage',
      'Advanced analytics & reports',
      'Priority email support',
    ],
    buyerFeatures: [
      '25 users — Team',
      'Up to 50 projects',
      '50 GB storage',
      '3 industries, 3 equipment categories',
      'Executive Summary access',
      'Advanced analytics & reports',
      'Priority email support',
    ],
    limits: {
      maxProjects: 50,
      maxUsers: 25,
      maxAssets: 500,
      maxStorageGB: 50,
      maxIndustries: Infinity,
      maxCategories: Infinity,
      maxServiceCategories: Infinity,
      basicDashboard: true,
      companyProfile: true,
      basicAnalytics: true,
      advancedReports: true,
      customIntegrations: false,
      auditManagement: false,
      costManagement: false,
      productionManagement: false,
      productionStandard: false,
      enterpriseManagement: false,
      teamManagement: true,
      messenger: false,
      profileContacts: false,
      aiInsights: false,
      erpIntegrations: false,
      procurement: false,
      contractManagement: false,
      spendAnalysis: false,
      complianceEsg: false,
      templateLibrary: false,
      auditLogs: false,
      emailSupport: true,
      prioritySupport: true,
      multipleIndustries: true,
      executiveSummary: true,
      projectAuditSchedule: false,
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    tier: TIERS.PREMIUM,
    price: 250,
    annualPrice: 212.50,     // 15 % off $250
    triennialPrice: 187.50,  // 25 % off $250
    interval: 'month',
    storageGB: 100,          // per user
    storagePerUser: true,
    features: [
      'Unlimited users',
      'Unlimited projects',
      '100 GB storage / user',
      'Full analytics suite',
      'Cost & Production Management',
      'Messenger',
      'Profile contact management',
      'Custom integrations',
      'SLA & priority support',
    ],
    limits: {
      maxProjects: Infinity,
      maxUsers: Infinity,
      maxAssets: Infinity,
      maxStorageGB: 100,      // per user
      storagePerUser: true,
      maxIndustries: Infinity,
      maxCategories: Infinity,
      maxServiceCategories: Infinity,
      basicDashboard: true,
      companyProfile: true,
      basicAnalytics: true,
      advancedReports: true,
      customIntegrations: true,
      auditManagement: true,
      costManagement: true,
      productionManagement: true,
      productionStandard: true,
      enterpriseManagement: false,
      teamManagement: true,
      messenger: true,
      profileContacts: true,
      aiInsights: false,
      erpIntegrations: false,
      procurement: false,
      contractManagement: false,
      spendAnalysis: false,
      complianceEsg: false,
      templateLibrary: false,
      auditLogs: false,
      emailSupport: true,
      prioritySupport: true,
      multipleIndustries: true,
      executiveSummary: true,
      projectAuditSchedule: true,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: TIERS.ENTERPRISE,
    price: 999,
    annualPrice: 849.15,       // 15 % off $999
    triennialPrice: 749.25,    // 25 % off $999
    interval: 'month',
    storageGB: 500,            // per user
    storagePerUser: true,
    features: [
      'Unlimited users',
      'Unlimited projects',
      '500 GB storage / user',
      'Everything in Premium',
      'Enterprise Management',
      'Procurement & PO workflows',
      'Contract Management & Alerts',
      'Spend Analysis dashboards',
      'Compliance & ESG checklists',
      'AI Insights & Risk Prediction',
      'ERP / API integrations (SAP, QuickBooks)',
      'Template Library',
      'System Audit Logs',
      'Dedicated account manager',
      '24/7 priority support',
    ],
    buyerFeatures: [
      'Unlimited users',
      'Unlimited projects',
      '500 GB storage / user',
      'Everything in Premium',
      'Enterprise Management',
      'Multi-level Procurement workflows',
      'Contract lifecycle & renewal alerts',
      'Spend analysis by vendor / category',
      'ESG & regulatory compliance',
      'AI-powered risk & savings insights',
      'ERP integrations (SAP, QuickBooks, Xero)',
      'Procurement template library',
      'Full system audit trail',
      'Dedicated account manager',
    ],
    limits: {
      maxProjects: Infinity,
      maxUsers: Infinity,
      maxAssets: Infinity,
      maxStorageGB: 500,      // per user
      storagePerUser: true,
      maxIndustries: Infinity,
      maxCategories: Infinity,
      maxServiceCategories: Infinity,
      basicDashboard: true,
      companyProfile: true,
      basicAnalytics: true,
      advancedReports: true,
      customIntegrations: true,
      auditManagement: true,
      costManagement: true,
      productionManagement: true,
      productionStandard: true,
      enterpriseManagement: true,
      teamManagement: true,
      messenger: true,
      profileContacts: true,
      aiInsights: true,
      erpIntegrations: true,
      procurement: true,
      contractManagement: true,
      spendAnalysis: true,
      complianceEsg: true,
      templateLibrary: true,
      auditLogs: true,
      emailSupport: true,
      prioritySupport: true,
      multipleIndustries: true,
      executiveSummary: true,
      projectAuditSchedule: true,
    },
  },
]

/* ── Buyer limit overrides (restrict industries / categories) ── */
const BUYER_LIMIT_OVERRIDES = {
  basic:      { maxIndustries: 1, maxCategories: 1, multipleIndustries: false },
  standard:   { maxIndustries: 3, maxCategories: 3, executiveSummary: true },
  premium:    {},  // full access at premium level
  enterprise: {},  // full access at enterprise level
}

/* ── Service Provider limit overrides ──────────────────────── */
/* Service providers do NOT register in industries — they register in service categories.
 * maxIndustries is forced to 0 (they see the Industries widget as locked).
 * maxServiceCategories controls how many service categories they can pick. */
const SERVICE_PROVIDER_LIMIT_OVERRIDES = {
  start:      { maxIndustries: 0, maxCategories: 0, maxServiceCategories: 1, multipleIndustries: false, executiveSummary: false },
  basic:      { maxIndustries: 0, maxCategories: 0, maxServiceCategories: Infinity, executiveSummary: false },
  standard:   { maxIndustries: 0, maxCategories: 0, maxServiceCategories: Infinity, executiveSummary: false },
  premium:    { maxIndustries: 0, maxCategories: 0, maxServiceCategories: Infinity },
  enterprise: { maxIndustries: 0, maxCategories: 0, maxServiceCategories: Infinity },
}

/* ── Account type constants ──────────────────────────────── */
export const ACCOUNT_TYPES = [
  { id: 'seller', label: 'Seller', shortLabel: 'S', description: 'Sell equipment & services' },
  { id: 'buyer', label: 'Buyer', shortLabel: 'B', description: 'Source equipment & suppliers' },
  { id: 'service_provider', label: 'Service Provider', shortLabel: 'SP', description: 'Provide services & maintenance' },
]

export function getPlanById(planId) {
  return PLANS.find((p) => p.id === planId) || PLANS[0]
}

/**
 * Get effective limits taking into account the account type.
 * Buyers have stricter industry/category limits at Basic and Standard.
 * Sellers can never see executive summary (it's buyer only).
 * Service providers have similar structure to sellers but with service-specific overrides.
 */
export function getEffectiveLimits(planId, accountType) {
  const plan = getPlanById(planId)
  const base = { ...plan.limits }

  if (accountType === 'buyer') {
    const overrides = BUYER_LIMIT_OVERRIDES[planId] || {}
    return { ...base, ...overrides }
  }

  if (accountType === 'service_provider') {
    const overrides = SERVICE_PROVIDER_LIMIT_OVERRIDES[planId] || {}
    return { ...base, ...overrides, executiveSummary: false }
  }

  // Sellers: cannot see executive summary page (they get RFQ notifications instead)
  return { ...base, executiveSummary: false }
}

/** Default buyer trial duration in days. */
export const BUYER_TRIAL_DAYS = 30

/**
 * Get plans available for a given account type.
 * Buyers start from Basic (the "start" / free plan is seller-only).
 * Sellers and Service Providers can use all plans (including Free).
 */
export function getPlansForAccountType(accountType) {
  if (accountType === 'buyer') {
    return PLANS.filter((p) => !p.sellerOnly)
  }
  return PLANS // sellers and service_providers have all plans
}

/**
 * Get the display price for a plan based on account type and billing period.
 * Billing periods: 'monthly' (default), 'annual' (15 % off), 'triennial' (25 % off).
 */
export function getPlanPrice(plan, accountType, billingPeriod = 'monthly') {
  if (billingPeriod === 'triennial' && plan.triennialPrice != null) return plan.triennialPrice
  if (billingPeriod === 'annual' && plan.annualPrice != null) return plan.annualPrice
  return plan.price
}

/**
 * Get the billing period label string.
 */
export function getBillingLabel(billingPeriod) {
  if (billingPeriod === 'annual') return 'Annual'
  if (billingPeriod === 'triennial') return '3-Year'
  return 'Monthly'
}

/**
 * Get the storage limit string for display.
 */
export function getStorageLabel(plan) {
  if (!plan) return ''
  if (plan.storagePerUser) return `${plan.storageGB} GB / user`
  return `${plan.storageGB} GB`
}

/**
 * Get the display features for a plan based on account type.
 */
export function getPlanFeatures(plan, accountType) {
  if (accountType === 'buyer' && plan.buyerFeatures) {
    return plan.buyerFeatures
  }
  // Service providers use seller features for now (same base features)
  return plan.features
}

/**
 * Get the short label for an account type.
 */
export function getAccountTypeLabel(accountType) {
  const found = ACCOUNT_TYPES.find((t) => t.id === accountType)
  return found ? found.label : accountType
}

export function getAccountTypeShortLabel(accountType) {
  const found = ACCOUNT_TYPES.find((t) => t.id === accountType)
  return found ? found.shortLabel : accountType?.charAt(0)?.toUpperCase() || '?'
}

export function getTierLevel(planId) {
  const plan = getPlanById(planId)
  return plan.tier ?? TIERS.START
}

/* ── Checkout flow ───────────────────────────────────────── */

const stripeService = {
  isAvailable: isStripeConfigured,
  plans: PLANS,
  TIERS,

  async checkout(planId) {
    if (!isStripeConfigured) {
      console.warn('[Stripe] Not configured — skipping checkout')
      return { error: 'Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in .env' }
    }
    analytics.track('checkout_started', { plan: planId })
    try {
      const { session_id } = await billingApi.createCheckout(planId)
      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe failed to load')
      const { error } = await stripe.redirectToCheckout({ sessionId: session_id })
      if (error) throw error
      return { success: true }
    } catch (err) {
      // Fallback path: if backend checkout endpoint is unavailable, redirect
      // directly via Stripe price IDs configured in Vercel env vars.
      const priceIdByPlan = {
        basic: env.STRIPE_PRICE_ID_BASIC,
        standard: env.STRIPE_PRICE_ID_STANDARD,
        premium: env.STRIPE_PRICE_ID_PREMIUM,
        enterprise: env.STRIPE_PRICE_ID_ENTERPRISE,
      }
      const fallbackPriceId = priceIdByPlan[planId]
      if (fallbackPriceId) {
        try {
          const stripe = await getStripe()
          if (stripe) {
            const result = await stripe.redirectToCheckout({
              mode: 'subscription',
              lineItems: [{ price: fallbackPriceId, quantity: 1 }],
              successUrl: `${window.location.origin}/plans?success=true`,
              cancelUrl: `${window.location.origin}/plans?canceled=true`,
            })
            if (!result?.error) return { success: true }
          }
        } catch {
          // Keep default error handling below.
        }
      }

      const rawMessage =
        err?.detail ||
        err?.data?.detail ||
        err?.data?.message ||
        err?.data?.error ||
        err?.message ||
        ''

      const normalized = String(rawMessage).trim().toLowerCase()
      const isGenericUnexpected =
        !normalized ||
        normalized === 'unexpected error' ||
        normalized === 'internal server error' ||
        normalized === 'error'

      const errorMessage = isGenericUnexpected
        ? 'Checkout is temporarily unavailable. Please try again in a minute. If this persists, set VITE_STRIPE_PRICE_ID_BASIC/STANDARD/PREMIUM/ENTERPRISE in Vercel for direct fallback checkout.'
        : String(rawMessage)

      analytics.track('checkout_error', { plan: planId, error: errorMessage })
      return { error: errorMessage }
    }
  },

  async openCustomerPortal() {
    try {
      const { url } = await billingApi.createPortal()
      window.location.href = url
    } catch (err) {
      return { error: err.message || 'Could not open billing portal' }
    }
  },

  async getSubscription() {
    try {
      return await billingApi.getSubscription()
    } catch {
      return { plan_id: 'start', status: 'active' }
    }
  },
}

/**
 * Sync subscription status from the Supabase `subscriptions` table.
 * Returns { plan_id, status, current_period_end } or null.
 */
export async function syncSubscriptionFromSupabase() {
  try {
    const { supabase } = await import('../config/supabase')
    if (!supabase) return null
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_end, stripe_customer_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data || null
  } catch {
    return null
  }
}

export default stripeService
