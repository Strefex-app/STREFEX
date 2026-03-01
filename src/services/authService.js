/**
 * Authentication service — orchestrates login/logout across:
 *   • Supabase Auth   (primary — email/password, OAuth, magic link)
 *   • Firebase Auth   (legacy SSO, email/password — when configured)
 *   • Backend JWT     (multi-tenant RBAC — always available)
 *   • Zustand store   (client-side session state)
 *
 * Priority order:
 *   1.  Supabase (when VITE_SUPABASE_URL is set)
 *   2.  Firebase (when VITE_FIREBASE_API_KEY is set)
 *   3.  Direct backend API
 *   4.  Offline / localStorage fallback
 */
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth as firebaseAuth, isFirebaseConfigured } from '../config/firebase'
import { isSupabaseConfigured } from '../config/supabase'
import { supabaseAuth, profilesService, companiesService } from './supabaseService'
import { authApi } from './api'
import { useAuthStore } from '../store/authStore'
import { useSubscriptionStore } from './featureFlags'
import { analytics } from './analytics'
import { isSuperadminEmail } from './superadminAuth'
import {
  useIndustrySubscriptionStore,
  createFreeSubscription,
  createPendingSubscription,
} from './subscriptionService'
import { useIndustryStore } from '../store/industryStore'

const googleProvider = isFirebaseConfigured ? new GoogleAuthProvider() : null

/* ── Internal helpers ────────────────────────────────────── */

function capRole(role, email) {
  if (role === 'superadmin' && !isSuperadminEmail(email)) return 'admin'
  return role || 'user'
}

/**
 * After successful Supabase auth, sync with Zustand store.
 */
async function storeSupabaseSession(session, profile) {
  const user = session?.user
  const role = capRole(profile?.role || 'user', user?.email)
  const metadata = profile?.metadata || {}
  const metadataAccountTypes = Array.isArray(metadata.account_types)
    ? metadata.account_types
    : []
  const fallbackAccountType = metadata.account_type || user?.user_metadata?.account_type || 'seller'
  const accountTypes = metadataAccountTypes.length > 0
    ? metadataAccountTypes
    : [fallbackAccountType]
  const primaryAccountType = accountTypes[0] || fallbackAccountType

  useAuthStore.getState().login({
    role,
    token: session?.access_token || null,
    expiresAt: session?.expires_at ? session.expires_at * 1000 : Date.now() + 55 * 60 * 1000,
    user: {
      id: user?.id,
      email: user?.email,
      fullName: profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0],
      role,
      phone: profile?.phone,
      accountTypes,
      primaryAccountType,
    },
    tenant: profile?.company_id
      ? {
          id: profile.company_id,
          name: profile.companies?.name || profile.company_id,
          slug: profile.companies?.slug || profile.company_id,
        }
      : null,
  })

  analytics.track('user_login', {
    method: 'supabase',
    role,
    tenant: profile?.companies?.slug,
  })

  // Load active subscriptions for industry+tier access guards.
  if (user?.id) {
    await useIndustrySubscriptionStore.getState().loadActiveSubscriptions(user.id)
  }

  // Restore supplier industry/category registrations from database metadata.
  await useIndustryStore.getState().hydrateFromDatabase?.()

  // Keep UI account-type context aligned with profile metadata.
  useSubscriptionStore.getState().setAccountType(primaryAccountType)
}

async function syncProfileFromRegistrationMetadata(user, profile) {
  if (!user) return profile

  const md = user.user_metadata || {}
  const hasRegistrationMetadata = Boolean(md.tier || md.account_type || md.company_name || md.industry)
  if (!hasRegistrationMetadata) return profile

  const fullName = (md.full_name || profile?.full_name || '').trim()
  const phone = md.phone || profile?.phone || null

  let companyId = profile?.company_id || null
  if (!companyId) {
    const companyName = (md.company_name || fullName || user.email?.split('@')[0] || 'Company').trim()
    const slugBase = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    try {
      const created = await companiesService.create({
        name: companyName,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        email: user.email,
        phone: phone || null,
        account_type: md.account_type || 'seller',
        plan: md.tier || 'free',
        status: 'active',
      })
      companyId = created?.id || null
    } catch {
      // Leave company_id as-is if company creation fails; profile still updates.
    }
  }

  const metadata = {
    ...(profile?.metadata || {}),
    account_type: md.account_type || profile?.metadata?.account_type || null,
    account_types: Array.isArray(md.account_types)
      ? md.account_types
      : (profile?.metadata?.account_types || (md.account_type ? [md.account_type] : [])),
    industry: md.industry || profile?.metadata?.industry || null,
    industries: Array.isArray(md.industries)
      ? md.industries
      : (Array.isArray(profile?.metadata?.industries)
        ? profile.metadata.industries
        : (md.industry ? [md.industry] : [])),
    categories: (md.categories && typeof md.categories === 'object')
      ? md.categories
      : (profile?.metadata?.categories || {}),
    tier: md.tier || profile?.metadata?.tier || 'free',
  }

  const nextRole = companyId ? 'admin' : (profile?.role || 'user')
  const metadataChanged = JSON.stringify(profile?.metadata || {}) !== JSON.stringify(metadata)
  const needsUpdate = !profile
    || profile.full_name !== fullName
    || (profile.phone || null) !== (phone || null)
    || profile.company_id !== companyId
    || profile.role !== nextRole
    || metadataChanged

  if (!needsUpdate) return profile

  await profilesService.updateProfile({
    company_id: companyId,
    full_name: fullName || null,
    phone: phone || null,
    role: nextRole,
    metadata,
  })

  return profilesService.getMyProfile()
}

/**
 * After successful legacy (Firebase/backend) authentication, store the session.
 */
function storeSession(backendResponse) {
  const { access_token, user, tenant } = backendResponse || {}
  const expiresAt = Date.now() + 55 * 60 * 1000

  const role = capRole(user?.role, user?.email)

  useAuthStore.getState().login({
    role,
    token: access_token,
    expiresAt,
    user: user
      ? {
          id: user.id,
          email: user.email,
          fullName: user.full_name ?? user.fullName,
          role,
          accountTypes: Array.isArray(user.account_types)
            ? user.account_types
            : [user.account_type || 'seller'],
          primaryAccountType: user.account_type || 'seller',
        }
      : null,
    tenant: tenant
      ? { id: tenant.id, name: tenant.name, slug: tenant.slug }
      : null,
  })

  analytics.track('user_login', {
    method: isFirebaseConfigured ? 'firebase' : 'direct',
    role: user?.role,
    tenant: tenant?.slug,
  })
}

/* ── Public API ──────────────────────────────────────────── */

const authService = {
  /**
   * Sign in with email and password.
   * Tries Supabase first, then Firebase, then direct backend.
   */
  async loginWithEmail(email, password, tenantSlug = null) {
    // ── Supabase path ──
    if (isSupabaseConfigured) {
      const { session, user } = await supabaseAuth.signIn(email, password)

      // Block login for users whose email is not yet confirmed
      if (user && !user.email_confirmed_at) {
        await supabaseAuth.signOut().catch(() => {})
        const err = new Error('Please verify your email before logging in.')
        err.code = 'email_not_confirmed'
        throw err
      }

      // If registration happened before email confirmation, ensure free tier
      // is materialized after first successful login.
      const metaTier = (user?.user_metadata?.tier || '').toLowerCase()
      const metaIndustry = user?.user_metadata?.industry || 'automotive'
      if (user?.id && metaTier === 'free') {
        await createFreeSubscription({ userId: user.id, industry: metaIndustry }).catch(() => {})
      }

      const rawProfile = await profilesService.getMyProfile()
      const profile = await syncProfileFromRegistrationMetadata(user, rawProfile)
      await storeSupabaseSession(session, profile)
      return { session, user, profile }
    }

    // ── Firebase path (sign-in only — never auto-create) ──
    if (isFirebaseConfigured) {
      try {
        await signInWithEmailAndPassword(firebaseAuth, email, password)
      } catch (fbError) {
        if (fbError.code === 'auth/user-not-found') {
          throw new Error('No account found with this email. Please register first.')
        } else if (fbError.code === 'auth/invalid-credential' || fbError.code === 'auth/wrong-password') {
          throw new Error('Invalid email or password')
        } else {
          throw new Error(fbError.message)
        }
      }
    }

    // ── Backend JWT path ──
    try {
      const response = await authApi.login(email, password, tenantSlug)
      storeSession(response)
      return response
    } catch (err) {
      if (isFirebaseConfigured && firebaseAuth.currentUser) {
        await firebaseSignOut(firebaseAuth).catch(() => {})
      }
      throw err
    }
  },

  /**
   * Sign in with Google.
   * Prefers Supabase OAuth; falls back to Firebase popup.
   */
  async loginWithGoogle(tenantSlug = null) {
    if (isSupabaseConfigured) {
      await supabaseAuth.signInWithOAuth('google')
      return
    }

    if (!isFirebaseConfigured || !googleProvider) {
      throw new Error('Google SSO requires Firebase or Supabase configuration.')
    }

    const result = await signInWithPopup(firebaseAuth, googleProvider)
    const idToken = await result.user.getIdToken()
    const gEmail = result.user.email

    try {
      const response = await authApi.login(gEmail, idToken, tenantSlug)
      storeSession(response)
      return response
    } catch (err) {
      if (isFirebaseConfigured && firebaseAuth.currentUser) {
        await firebaseSignOut(firebaseAuth).catch(() => {})
      }
      throw new Error(
        err.detail || 'Google SSO succeeded but backend registration is pending. Contact your administrator.'
      )
    }
  },

  /**
   * Register a new user.
   * Supabase: creates auth user + company, then logs in.
   * Firebase: creates Firebase account, then calls backend register.
   */
  async register({
    fullName,
    email,
    password,
    phone,
    company,
    selectedPlan = 'start',
    accountType = 'seller',
    accountTypes = null,
    selectedIndustry = 'general',
    selectedTier = 'free',
  }) {
    // ── Supabase path ──
    if (isSupabaseConfigured) {
      const normalizedTier = (selectedTier || selectedPlan || 'free').toLowerCase()
      const normalizedAccountTypes = Array.isArray(accountTypes) && accountTypes.length > 0
        ? accountTypes
        : [accountType]
      const primaryAccountType = normalizedAccountTypes[0] || accountType
      const signUpData = await supabaseAuth.signUp({
        email,
        password,
        fullName,
        phone,
        metadata: {
          company_name: company || '',
          account_type: primaryAccountType,
          account_types: normalizedAccountTypes,
          industry: selectedIndustry,
          industries: [selectedIndustry],
          categories: { [selectedIndustry]: [] },
          tier: normalizedTier,
        },
      })
      const user = signUpData?.user
      const session = signUpData?.session

      // When Supabase has "Confirm email" enabled, session is null until the
      // user clicks the link.  We still create the company row so it's ready
      // when they confirm.
      if (user) {
        const companySlug = (company || fullName || email.split('@')[0])
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        try {
          const newCompany = await companiesService.create({
            name: company || fullName || email.split('@')[0],
            slug: `${companySlug}-${Date.now().toString(36)}`,
            email: email,
            phone: phone || null,
            account_type: primaryAccountType,
            plan: selectedPlan,
            status: 'active',
          })

          if (newCompany) {
            await profilesService.updateProfile({
              company_id: newCompany.id,
              full_name: fullName,
              phone: phone || null,
              role: 'admin',
              metadata: {
                account_type: primaryAccountType,
                account_types: normalizedAccountTypes,
                industry: selectedIndustry,
                industries: [selectedIndustry],
                categories: { [selectedIndustry]: [] },
                tier: normalizedTier,
              },
              email_verified: false,
              phone_verified: false,
            })
          }
        } catch (companyErr) {
          console.warn('[authService.register] Company/profile setup deferred — will complete after email confirmation:', companyErr.message)
        }

        // No session means email confirmation is pending
        if (!session) {
          analytics.track('user_register', {
            method: 'supabase',
            tier: normalizedTier,
            accountType: primaryAccountType,
            industry: selectedIndustry,
            awaitingConfirmation: true,
          })
          return {
            user,
            emailConfirmationPending: true,
            selectedIndustry,
            selectedTier: normalizedTier,
          }
        }

        // Session exists — email confirmation is disabled or auto-confirmed
        const profile = await profilesService.getMyProfile()
        await storeSupabaseSession(session, profile)

        // Free tier grants access immediately.
        if (normalizedTier === 'free') {
          await createFreeSubscription({ userId: user.id, industry: selectedIndustry })
        } else {
          // Paid tiers are pending until Stripe webhook confirms payment.
          await createPendingSubscription({ userId: user.id, industry: selectedIndustry, tier: normalizedTier })
        }

        await useIndustrySubscriptionStore.getState().loadActiveSubscriptions(user.id)
        analytics.track('user_register', {
          method: 'supabase',
          tier: normalizedTier,
          accountType: primaryAccountType,
          industry: selectedIndustry,
        })
        return { session, user, profile, requiresPayment: normalizedTier !== 'free', tier: normalizedTier, industry: selectedIndustry }
      }
      return signUpData
    }

    // ── Firebase path ──
    if (isFirebaseConfigured) {
      try {
        await createUserWithEmailAndPassword(firebaseAuth, email, password)
      } catch (fbError) {
        if (fbError.code === 'auth/email-already-in-use') {
          // Already exists in Firebase — proceed to backend
        } else {
          throw new Error(fbError.message)
        }
      }
    }

    // ── Backend path ──
    try {
      const response = await authApi.register({
        full_name: fullName,
        email,
        password,
        company_name: company,
        selected_plan: selectedPlan,
      })
      storeSession(response)
      analytics.track('user_register', {
        method: isFirebaseConfigured ? 'firebase' : 'direct',
        role: response.user?.role,
        plan: selectedPlan,
      })
      return response
    } catch (err) {
      if (isFirebaseConfigured && firebaseAuth.currentUser) {
        await firebaseSignOut(firebaseAuth).catch(() => {})
      }
      throw err
    }
  },

  /**
   * Sign out from everything.
   */
  async logout() {
    analytics.track('user_logout')

    if (isSupabaseConfigured) {
      await supabaseAuth.signOut().catch(() => {})
    }
    if (isFirebaseConfigured && firebaseAuth?.currentUser) {
      await firebaseSignOut(firebaseAuth).catch(() => {})
    }
    useAuthStore.getState().logout()
  },

  /**
   * Refresh the user profile.
   */
  async refreshProfile() {
    try {
      if (isSupabaseConfigured) {
        const profile = await profilesService.getMyProfile()
        if (profile) {
          const store = useAuthStore.getState()
          store.setUser?.({
            id: profile.id,
            email: profile.email,
            fullName: profile.full_name,
            role: profile.role,
            phone: profile.phone,
            accountTypes: Array.isArray(profile?.metadata?.account_types)
              ? profile.metadata.account_types
              : [profile?.metadata?.account_type || 'seller'],
            primaryAccountType: profile?.metadata?.account_type || 'seller',
          })
          return profile
        }
      }
      const user = await authApi.me()
      const store = useAuthStore.getState()
      store.setUser?.({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      })
      return user
    } catch {
      return null
    }
  },

  /**
   * Listen for auth state changes.
   * Supabase takes priority; falls back to Firebase.
   */
  onAuthStateChange(callback) {
    if (isSupabaseConfigured) {
      const { data } = supabaseAuth.onAuthStateChange((event, session) => {
        callback(session?.user || null)
      })
      return data.subscription?.unsubscribe || (() => {})
    }
    if (!isFirebaseConfigured || !firebaseAuth) {
      return () => {}
    }
    return onAuthStateChanged(firebaseAuth, callback)
  },

  /**
   * Initialize auth — restore session on app load.
   * If no valid session exists, clears the Zustand store to prevent
   * stale localStorage state from granting access.
   */
  async initSession() {
    if (!isSupabaseConfigured) {
      // Without Supabase, check if the stored token has expired
      const { expiresAt, isAuthenticated } = useAuthStore.getState()
      if (isAuthenticated && expiresAt && Date.now() > expiresAt) {
        useAuthStore.getState().logout()
      }
      return null
    }
    try {
      const session = await supabaseAuth.getSession()
      if (session?.user) {
        const rawProfile = await profilesService.getMyProfile()
        const profile = await syncProfileFromRegistrationMetadata(session.user, rawProfile)
        await storeSupabaseSession(session, profile)
        await useIndustrySubscriptionStore.getState().loadActiveSubscriptions(session.user.id)
        return { session, profile }
      }
    } catch {
      // Silent — no session to restore
    }

    // No valid Supabase session — clear any stale auth state
    if (useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().logout()
    }
    return null
  },

  /** Whether Google SSO is available (via Supabase or Firebase). */
  isGoogleSSOAvailable: isSupabaseConfigured || isFirebaseConfigured,

  /** Whether Supabase is the primary auth provider. */
  isSupabaseConfigured,

  /** Whether Firebase is configured. */
  isFirebaseConfigured,
}

export default authService
