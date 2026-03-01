/**
 * Industry & equipment category selection store.
 *
 * Tracks which industries and equipment categories the current user has chosen.
 * Free plan: 1 industry + 1 equipment category.
 * Basic+:   all industries and all categories are accessible.
 *
 * Persisted to localStorage per-user AND synced to the account registry
 * so that buyer/seller registrations are permanent and visible platform-wide.
 */
import { create } from 'zustand'
import { useAccountRegistry } from './accountRegistry'
import { tenantKey } from '../utils/tenantStorage'
import { isSupabaseConfigured, profilesService, companiesService } from '../services/supabaseService'

const IND_BASE = 'strefex-selected-industries'
const CAT_BASE = 'strefex-selected-categories'

/** Sync current selections to the account registry (best-effort). */
const syncToRegistry = (industries, categories) => {
  try {
    const authRaw = localStorage.getItem('strefex-auth')
    const auth = authRaw ? JSON.parse(authRaw) : null
    const email = auth?.user?.email
    if (!email) return
    const subRaw = localStorage.getItem(tenantKey('strefex-subscription'))
    const sub = subRaw ? JSON.parse(subRaw) : {}
    const registry = useAccountRegistry.getState()
    const existing = registry.getAccountByEmail(email)
    if (existing) {
      registry.updateAccount(email, { industries: [...industries], categories: { ...categories } })
    } else {
      registry.registerAccount({
        id: `reg-${Date.now()}`,
        company: auth?.tenant?.name || auth?.user?.name || 'Unknown',
        email,
        contactName: auth?.user?.name || '',
        accountType: sub.accountType || 'seller',
        plan: sub.planId || 'start',
        status: 'active',
        industries: [...industries],
        categories: { ...categories },
        registeredAt: new Date().toISOString(),
        validUntil: null,
      })
    }
  } catch { /* silent — registry sync is best-effort */ }
}

const getStored = (baseKey, fallback) => {
  try {
    const raw = localStorage.getItem(tenantKey(baseKey))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const save = (baseKey, value) => {
  try {
    localStorage.setItem(tenantKey(baseKey), JSON.stringify(value))
  } catch { /* silent */ }
}

/** Persist selected industries/categories to Supabase profile/company metadata (best-effort). */
const syncToSupabase = async (industries, categories) => {
  if (!isSupabaseConfigured) return
  try {
    const profile = await profilesService.getMyProfile()
    if (!profile) return

    const nextMetadata = {
      ...(profile.metadata || {}),
      industries: [...industries],
      categories: { ...categories },
    }

    await profilesService.updateProfile({ metadata: nextMetadata })

    if (profile.company_id) {
      await companiesService.update(profile.company_id, {
        metadata: {
          ...(profile.companies?.metadata || {}),
          industries: [...industries],
          categories: { ...categories },
        },
      }).catch(() => {})
    }
  } catch {
    // Silent — local flow remains functional even if network/DB is unavailable.
  }
}

export const useIndustryStore = create((set, get) => ({
  /* ── Industries ────────────────────────────────────────── */

  /** Array of chosen industry IDs, e.g. ['automotive'] */
  selectedIndustries: getStored(IND_BASE, []),

  /** Select an industry (respects maxCount). Returns true if added. */
  selectIndustry: (industryId, maxCount = 1) => {
    const current = get().selectedIndustries
    if (current.includes(industryId)) return true
    if (current.length >= maxCount) return false
    const next = [...current, industryId]
    save(IND_BASE, next)
    set({ selectedIndustries: next })
    syncToRegistry(next, get().selectedCategories)
    syncToSupabase(next, get().selectedCategories)
    return true
  },

  deselectIndustry: (industryId) => {
    const next = get().selectedIndustries.filter((id) => id !== industryId)
    save(IND_BASE, next)
    set({ selectedIndustries: next })
    const cats = { ...get().selectedCategories }
    delete cats[industryId]
    save(CAT_BASE, cats)
    set({ selectedCategories: cats })
    syncToRegistry(next, cats)
    syncToSupabase(next, cats)
  },

  setIndustries: (ids) => {
    save(IND_BASE, ids)
    set({ selectedIndustries: ids })
    syncToRegistry(ids, get().selectedCategories)
    syncToSupabase(ids, get().selectedCategories)
  },

  isSelected: (industryId) => get().selectedIndustries.includes(industryId),

  clearIndustries: () => {
    save(IND_BASE, [])
    save(CAT_BASE, {})
    set({ selectedIndustries: [], selectedCategories: {} })
    syncToSupabase([], {})
  },

  /* ── Equipment categories ─────────────────────────────── */

  /**
   * Map of industryId -> [categoryId, ...], e.g.
   * { automotive: ['injection-machines'] }
   */
  selectedCategories: getStored(CAT_BASE, {}),

  /** Select an equipment category within an industry. Returns true if added. */
  selectCategory: (industryId, categoryId, maxCount = 1) => {
    const cats = { ...get().selectedCategories }
    const current = cats[industryId] || []
    if (current.includes(categoryId)) return true
    if (current.length >= maxCount) return false
    cats[industryId] = [...current, categoryId]
    save(CAT_BASE, cats)
    set({ selectedCategories: cats })
    syncToRegistry(get().selectedIndustries, cats)
    syncToSupabase(get().selectedIndustries, cats)
    return true
  },

  deselectCategory: (industryId, categoryId) => {
    const cats = { ...get().selectedCategories }
    cats[industryId] = (cats[industryId] || []).filter((id) => id !== categoryId)
    if (cats[industryId].length === 0) delete cats[industryId]
    save(CAT_BASE, cats)
    set({ selectedCategories: cats })
    syncToRegistry(get().selectedIndustries, cats)
    syncToSupabase(get().selectedIndustries, cats)
  },

  /** Get selected categories for a specific industry. */
  getCategoriesForIndustry: (industryId) => get().selectedCategories[industryId] || [],

  /** Check if a category is selected. */
  isCategorySelected: (industryId, categoryId) =>
    (get().selectedCategories[industryId] || []).includes(categoryId),

  /**
   * Hydrate local industry/category selections from Supabase metadata.
   * Called after login/session restore to keep cross-device state consistent.
   */
  hydrateFromDatabase: async () => {
    if (!isSupabaseConfigured) return
    try {
      const profile = await profilesService.getMyProfile()
      const metadata = profile?.metadata || {}
      const dbIndustries = Array.isArray(metadata.industries) ? metadata.industries : null
      const dbCategories = metadata.categories && typeof metadata.categories === 'object' ? metadata.categories : null

      if (!dbIndustries && !dbCategories) return

      const nextIndustries = dbIndustries || []
      const nextCategories = dbCategories || {}

      save(IND_BASE, nextIndustries)
      save(CAT_BASE, nextCategories)
      set({ selectedIndustries: nextIndustries, selectedCategories: nextCategories })
      syncToRegistry(nextIndustries, nextCategories)
    } catch {
      // Silent fallback to existing local state.
    }
  },
}))
