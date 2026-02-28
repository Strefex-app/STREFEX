import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../config/supabase'

export const TIER_LEVELS = {
  free: 0,
  basic: 1,
  standard: 2,
  premium: 3,
  enterprise: 4,
}

export function hasMinimumTier(userTier, requiredTier) {
  const userLevel = TIER_LEVELS[userTier] ?? -1
  const requiredLevel = TIER_LEVELS[requiredTier] ?? 999
  return userLevel >= requiredLevel
}

export const useIndustrySubscriptionStore = create((set, get) => ({
  subscriptions: [],
  loading: false,
  error: null,

  setSubscriptions: (subscriptions) => set({ subscriptions: subscriptions || [] }),

  async loadActiveSubscriptions(userId) {
    if (!isSupabaseConfigured || !supabase || !userId) {
      set({ subscriptions: [] })
      return []
    }
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) throw error
      const rows = data || []
      set({ subscriptions: rows, loading: false })
      return rows
    } catch (err) {
      set({ loading: false, error: err?.message || 'Unable to load subscriptions' })
      return []
    }
  },

  getTierForIndustry: (industry) => {
    const found = get().subscriptions.find((s) => s.industry === industry && s.status === 'active')
    return found?.tier || null
  },

  hasIndustryAccess: (industry, requiredTier = 'free') => {
    const found = get().subscriptions.find((s) => s.industry === industry && s.status === 'active')
    if (!found) return false
    return hasMinimumTier(found.tier, requiredTier)
  },
}))

export async function createFreeSubscription({ userId, industry }) {
  if (!isSupabaseConfigured || !supabase || !userId || !industry) return null
  const payload = {
    user_id: userId,
    industry,
    tier: 'free',
    status: 'active',
    stripe_subscription_id: null,
  }
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(payload, { onConflict: 'user_id,industry' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createPendingSubscription({ userId, industry, tier }) {
  if (!isSupabaseConfigured || !supabase || !userId || !industry || !tier) return null
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        industry,
        tier,
        status: 'pending',
      },
      { onConflict: 'user_id,industry' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
