/**
 * Feature flag / gating service.
 *
 * Controls feature visibility based on the tenant's subscription tier.
 * Supports:
 *   - 5-tier hierarchy: START(0) < BASIC(1) < STANDARD(2) < PREMIUM(3) < ENTERPRISE(4)
 *   - Boolean feature flags from plan limits
 *   - Numeric limits (maxProjects, maxUsers, etc.)
 *   - Free trial (14 days premium access)
 *   - Downgrade / revoke logic
 *   - Dynamic overrides from backend
 *
 * Usage:
 *   import { useFeatureFlag, useTier } from '../services/featureFlags'
 *   const canUseAudits = useFeatureFlag('auditManagement')
 *   const isAtLeastStandard = useTier(TIERS.STANDARD)
 */
import { create } from 'zustand'
import { getPlanById, getEffectiveLimits, getTierLevel, TIERS, BUYER_TRIAL_DAYS } from './stripeService'
import { useAuthStore } from '../store/authStore'

/* ── Promo code definitions ────────────────────────────── */
const PROMO_CODES = {
  'STREFEX30':     { trialDays: 30,  planId: 'basic',    description: '30-day Basic trial' },
  'STREFEX60':     { trialDays: 60,  planId: 'basic',    description: '60-day Basic trial' },
  'STREFEX90':     { trialDays: 90,  planId: 'basic',    description: '90-day Basic trial' },
  'STREFEXPRO':    { trialDays: 30,  planId: 'standard', description: '30-day Standard trial' },
  'STREFEXPRO60':  { trialDays: 60,  planId: 'standard', description: '60-day Standard trial' },
  'STREFEXPREM':   { trialDays: 30,  planId: 'premium',  description: '30-day Premium trial' },
  'STREFEXVIP':    { trialDays: 90,  planId: 'premium',  description: '90-day Premium trial' },
}

function getPromoConfig(code) {
  return PROMO_CODES[code] || null
}

export { PROMO_CODES }

/* ── Superadmin helper — bypasses all plan/feature gates ── */
const _isSuperAdmin = () => {
  try { return useAuthStore.getState().role === 'superadmin' } catch { return false }
}

/* ── Tenant-scoped local storage helpers ──────────────────── */

import { tenantKey } from '../utils/tenantStorage'

const STORAGE_BASE = 'strefex-subscription'

const getStored = () => {
  try {
    const raw = localStorage.getItem(tenantKey(STORAGE_BASE))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const persistSub = (data) => {
  try {
    localStorage.setItem(tenantKey(STORAGE_BASE), JSON.stringify(data))
  } catch { /* silent */ }
}

const stored = getStored()

/* ── Subscription store ──────────────────────────────────── */

export const useSubscriptionStore = create((set, get) => ({
  /** Current plan ID: 'start' | 'basic' | 'standard' | 'premium' | 'enterprise' */
  planId: stored?.planId || 'start',

  /** Account type: 'seller' | 'buyer' | 'service_provider' */
  accountType: stored?.accountType || 'seller',

  /** Subscription status from Stripe */
  status: stored?.status || 'active', // 'active' | 'past_due' | 'canceled' | 'trialing'

  /** Trial end date (ISO string or null) */
  trialEndsAt: stored?.trialEndsAt || null,

  /** Billing period: 'monthly' | 'annual' | 'triennial' */
  billingPeriod: stored?.billingPeriod || 'monthly',

  /** Dynamic overrides (from backend) */
  overrides: stored?.overrides || {},

  /** Update plan after checkout or subscription fetch. */
  setPlan: (planId, status = 'active', trialEndsAt = null) => {
    const data = { planId, status, trialEndsAt, accountType: get().accountType, billingPeriod: get().billingPeriod, overrides: get().overrides }
    persistSub(data)
    set({ planId, status, trialEndsAt })
  },

  /** Set account type (buyer / seller). */
  setAccountType: (accountType) => {
    const data = { planId: get().planId, status: get().status, trialEndsAt: get().trialEndsAt, accountType, billingPeriod: get().billingPeriod, overrides: get().overrides }
    persistSub(data)
    set({ accountType })
  },

  /** Set billing period: 'monthly' | 'annual' | 'triennial'. */
  setBillingPeriod: (billingPeriod) => {
    const data = { planId: get().planId, status: get().status, trialEndsAt: get().trialEndsAt, accountType: get().accountType, billingPeriod, overrides: get().overrides }
    persistSub(data)
    set({ billingPeriod })
  },

  /** Start a 14-day free trial of enterprise (full access). */
  startTrial: () => {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const data = { planId: 'enterprise', status: 'trialing', trialEndsAt, accountType: get().accountType, billingPeriod: get().billingPeriod, overrides: get().overrides, promoCode: get().promoCode }
    persistSub(data)
    set({ planId: 'enterprise', status: 'trialing', trialEndsAt })
  },

  /**
   * Start the free 30-day buyer trial on the Basic plan.
   * Called automatically during buyer registration.
   */
  startBuyerTrial: (days = BUYER_TRIAL_DAYS) => {
    const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    const data = { planId: 'basic', status: 'trialing', trialEndsAt, accountType: 'buyer', billingPeriod: 'monthly', overrides: get().overrides, promoCode: get().promoCode }
    persistSub(data)
    set({ planId: 'basic', status: 'trialing', trialEndsAt, accountType: 'buyer' })
  },

  /**
   * Extend an existing trial by a number of days.
   * Used by superadmin to give extra time.
   */
  extendTrial: (extraDays) => {
    const current = get().trialEndsAt ? new Date(get().trialEndsAt) : new Date()
    const base = current > new Date() ? current : new Date()
    const trialEndsAt = new Date(base.getTime() + extraDays * 24 * 60 * 60 * 1000).toISOString()
    const data = { planId: get().planId, status: 'trialing', trialEndsAt, accountType: get().accountType, billingPeriod: get().billingPeriod, overrides: get().overrides, promoCode: get().promoCode }
    persistSub(data)
    set({ status: 'trialing', trialEndsAt })
  },

  /** Active promo code (null if none). */
  promoCode: stored?.promoCode || null,

  /**
   * Apply a promo code. In production this would validate server-side.
   * Returns true if the code was accepted.
   */
  applyPromoCode: (code) => {
    const normalized = (code || '').trim().toUpperCase()
    if (!normalized) return false
    const promo = getPromoConfig(normalized)
    if (!promo) return false

    const trialEndsAt = promo.trialDays
      ? new Date(Date.now() + promo.trialDays * 24 * 60 * 60 * 1000).toISOString()
      : get().trialEndsAt

    const planId = promo.planId || get().planId
    const status = promo.trialDays ? 'trialing' : get().status

    const data = { planId, status, trialEndsAt, accountType: get().accountType, billingPeriod: get().billingPeriod, overrides: get().overrides, promoCode: normalized }
    persistSub(data)
    set({ planId, status, trialEndsAt, promoCode: normalized })
    return true
  },

  /** Downgrade to start (free) — revoke all paid features. */
  downgrade: () => {
    const acctType = get().accountType
    const fallbackPlan = acctType === 'buyer' ? 'basic' : 'start'
    const data = { planId: fallbackPlan, status: acctType === 'buyer' ? 'trial_expired' : 'active', trialEndsAt: null, accountType: acctType, billingPeriod: 'monthly', overrides: {}, promoCode: null }
    persistSub(data)
    set({ planId: fallbackPlan, status: acctType === 'buyer' ? 'trial_expired' : 'active', trialEndsAt: null, billingPeriod: 'monthly', overrides: {}, promoCode: null })
  },

  /** Set dynamic overrides from backend. */
  setOverrides: (overrides) => {
    const data = { planId: get().planId, status: get().status, trialEndsAt: get().trialEndsAt, accountType: get().accountType, billingPeriod: get().billingPeriod, overrides }
    persistSub(data)
    set({ overrides })
  },

  /** Get the full plan object with limits. */
  getPlan: () => getPlanById(get().planId),

  /** Get effective limits (account-type aware). */
  getEffectiveLimits: () => getEffectiveLimits(get().planId, get().accountType),

  /** Get numeric tier level (0–4). */
  getTier: () => getTierLevel(get().planId),

  /** Check if a specific feature/limit is available on the current plan. */
  hasFeature: (featureKey) => {
    if (_isSuperAdmin()) return true
    const { trialEndsAt, status, accountType, planId } = get()

    // Trial expired — auto-downgrade
    if (status === 'trialing' && trialEndsAt && new Date(trialEndsAt) < new Date()) {
      get().downgrade()
      return false
    }
    // Buyer trial expired or subscription canceled — read-only with minimal access
    if (status === 'trial_expired' || status === 'canceled') {
      const base = { basicDashboard: true, companyProfile: true }
      return base[featureKey] ?? false
    }

    // Check dynamic overrides first
    const overrides = get().overrides
    if (featureKey in overrides) return overrides[featureKey]
    // Then check effective limits (account-type aware)
    const limits = getEffectiveLimits(planId, accountType)
    return limits[featureKey] ?? false
  },

  /** Check if the user's tier >= required tier (numeric). */
  hasTier: (requiredTier) => {
    if (_isSuperAdmin()) return true
    const { trialEndsAt, status, accountType } = get()

    if (status === 'trialing' && trialEndsAt && new Date(trialEndsAt) < new Date()) {
      get().downgrade()
      return TIERS.START >= requiredTier
    }
    if (status === 'trial_expired' || status === 'canceled') {
      return TIERS.START >= requiredTier
    }
    return getTierLevel(get().planId) >= requiredTier
  },

  /** Check if a numeric limit is within bounds (account-type aware). */
  withinLimit: (limitKey, currentCount) => {
    if (_isSuperAdmin()) return true
    const limits = getEffectiveLimits(get().planId, get().accountType)
    const max = limits[limitKey]
    if (max === undefined || max === Infinity) return true
    return currentCount < max
  },

  /** Is the subscription in trial? */
  isTrial: () => {
    const { status, trialEndsAt } = get()
    if (status !== 'trialing' || !trialEndsAt) return false
    return new Date(trialEndsAt) > new Date()
  },

  /** Days remaining in trial (0 if not trialing). */
  trialDaysLeft: () => {
    const { status, trialEndsAt } = get()
    if (status !== 'trialing' || !trialEndsAt) return 0
    const ms = new Date(trialEndsAt).getTime() - Date.now()
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
  },
}))

/* ── React hooks ─────────────────────────────────────────── */

/** Check if a boolean feature is available. */
export function useFeatureFlag(featureKey) {
  return useSubscriptionStore((s) => s.hasFeature(featureKey))
}

/** Check if user's tier >= required tier. */
export function useTier(requiredTier) {
  return useSubscriptionStore((s) => s.hasTier(requiredTier))
}

/** Get numeric limits info (account-type aware). Superadmin = unlimited. */
export function useLimit(limitKey, currentCount = 0) {
  const isSA = useAuthStore((s) => s.role === 'superadmin')
  const limits = useSubscriptionStore((s) => getEffectiveLimits(s.planId, s.accountType))
  if (isSA) return { allowed: true, limit: Infinity, remaining: Infinity }
  const max = limits[limitKey] ?? Infinity
  return {
    allowed: currentCount < max,
    limit: max,
    remaining: max === Infinity ? Infinity : Math.max(0, max - currentCount),
  }
}

/* ── FeatureGate component ───────────────────────────────── */

export function FeatureGate({ feature, children, fallback = null }) {
  const available = useFeatureFlag(feature)
  if (!available) return fallback
  return children
}

/** Gate by tier level. */
export function TierGate({ tier, children, fallback = null }) {
  const meets = useTier(tier)
  if (!meets) return fallback
  return children
}

export { TIERS }
