/**
 * Supabase Service — Unified data layer for the STREFEX Platform.
 *
 * Wraps all Supabase client operations (auth, database, storage) and
 * provides a clean API that the rest of the app consumes.
 *
 * When Supabase is NOT configured, every method returns null/empty
 * so the app falls back to localStorage seamlessly.
 */
import { supabase, isSupabaseConfigured } from '../config/supabase'

/* ================================================================
   AUTH
   ================================================================ */
export const supabaseAuth = {
  /**
   * Sign up with email + password.
   * Creates a Supabase auth user; the DB trigger auto-creates the profile.
   */
  async signUp({ email, password, fullName, phone }) {
    if (!isSupabaseConfigured) return null
    const redirectTo = `${window.location.origin}/login?confirmed=true`
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: redirectTo,
      },
    })
    if (error) throw error
    return data
  },

  /** Sign in with email + password. */
  async signIn(email, password) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  /** Sign in with magic link (passwordless). */
  async signInWithOtp(email) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase.auth.signInWithOtp({ email })
    if (error) throw error
    return data
  },

  /** Sign in with OAuth provider (Google, GitHub, etc.). */
  async signInWithOAuth(provider) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase.auth.signInWithOAuth({ provider })
    if (error) throw error
    return data
  },

  /** Sign out. */
  async signOut() {
    if (!isSupabaseConfigured) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  /** Get the current session. */
  async getSession() {
    if (!isSupabaseConfigured) return null
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  /** Get the current user. */
  async getUser() {
    if (!isSupabaseConfigured) return null
    const { data: { user } } = await supabase.auth.getUser()
    return user
  },

  /** Listen for auth state changes. */
  onAuthStateChange(callback) {
    if (!isSupabaseConfigured) return { data: { subscription: { unsubscribe: () => {} } } }
    return supabase.auth.onAuthStateChange(callback)
  },

  /** Reset password. */
  async resetPassword(email) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
    return data
  },

  /** Update user (password, email, metadata). */
  async updateUser(updates) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase.auth.updateUser(updates)
    if (error) throw error
    return data
  },
}

/* ================================================================
   PROFILES
   ================================================================ */
export const profilesService = {
  async getMyProfile() {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*, companies(*)')
      .eq('id', (await supabase.auth.getUser()).data.user?.id)
      .single()
    if (error) throw error
    return data
  },

  async updateProfile(updates) {
    if (!isSupabaseConfigured) return null
    const user = (await supabase.auth.getUser()).data.user
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user?.id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getCompanyProfiles(companyId) {
    if (!isSupabaseConfigured) return []
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', companyId)
    if (error) throw error
    return data || []
  },
}

/* ================================================================
   COMPANIES
   ================================================================ */
export const companiesService = {
  async create(company) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase
      .from('companies')
      .insert(company)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getById(id) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async list() {
    if (!isSupabaseConfigured) return []
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
}

/* ================================================================
   TEAM MEMBERS
   ================================================================ */
export const teamService = {
  async list(companyId) {
    if (!isSupabaseConfigured) return []
    const { data, error } = await supabase
      .from('team_members')
      .select('*, profiles(*)')
      .eq('company_id', companyId)
    if (error) throw error
    return data || []
  },

  async invite(member) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase
      .from('team_members')
      .insert(member)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateRole(id, role) {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id) {
    if (!isSupabaseConfigured) return null
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

/* ================================================================
   GENERIC CRUD FACTORY — for tenant-scoped tables
   ================================================================ */
function createCrudService(tableName) {
  return {
    async list(companyId, options = {}) {
      if (!isSupabaseConfigured) return []
      let query = supabase.from(tableName).select(options.select || '*')
      if (companyId) query = query.eq('company_id', companyId)
      if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending ?? false })
      else query = query.order('created_at', { ascending: false })
      if (options.limit) query = query.limit(options.limit)
      if (options.filters) {
        options.filters.forEach(([col, op, val]) => {
          query = query.filter(col, op, val)
        })
      }
      const { data, error } = await query
      if (error) throw error
      return data || []
    },

    async getById(id) {
      if (!isSupabaseConfigured) return null
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },

    async create(record) {
      if (!isSupabaseConfigured) return null
      const { data, error } = await supabase
        .from(tableName)
        .insert(record)
        .select()
        .single()
      if (error) throw error
      return data
    },

    async update(id, updates) {
      if (!isSupabaseConfigured) return null
      const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },

    async upsert(record) {
      if (!isSupabaseConfigured) return null
      const { data, error } = await supabase
        .from(tableName)
        .upsert(record)
        .select()
        .single()
      if (error) throw error
      return data
    },

    async remove(id) {
      if (!isSupabaseConfigured) return null
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)
      if (error) throw error
    },

    async count(companyId) {
      if (!isSupabaseConfigured) return 0
      let query = supabase.from(tableName).select('id', { count: 'exact', head: true })
      if (companyId) query = query.eq('company_id', companyId)
      const { count, error } = await query
      if (error) throw error
      return count || 0
    },
  }
}

/* ── Instantiate services for each table ─────────────────── */
export const projectsService   = createCrudService('projects')
export const rfqsService       = createCrudService('rfqs')
export const contractsService  = createCrudService('contracts')
export const procurementService = createCrudService('procurement_items')
export const vendorsService    = createCrudService('vendors')
export const transactionsService = createCrudService('transactions')
export const serviceRequestsService = createCrudService('service_requests')
export const notificationsService = createCrudService('notifications')
export const templatesService  = createCrudService('templates')
export const auditLogsService  = createCrudService('audit_logs')
export const walletService     = createCrudService('wallet_accounts')
export const walletTxService   = createCrudService('wallet_transactions')
export const escrowService     = createCrudService('escrow_transactions')
export const productionService = createCrudService('production_data')
export const costDataService   = createCrudService('cost_data')
export const enterpriseService = createCrudService('enterprise_data')
export const fileMetadataService = createCrudService('file_metadata')
export const subscriptionsService = createCrudService('subscriptions')

/* ================================================================
   STORAGE — File uploads
   ================================================================ */
export const storageService = {
  /**
   * Upload a file to a company's folder.
   * Path: {companyId}/{entityType}/{entityId}/{filename}
   */
  async upload({ companyId, entityType, entityId, file, bucket = 'documents' }) {
    if (!isSupabaseConfigured) return null
    const path = `${companyId}/${entityType}/${entityId || 'general'}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) throw error

    // Save metadata
    await fileMetadataService.create({
      company_id: companyId,
      bucket,
      path: data.path,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      entity_type: entityType,
      entity_id: entityId,
    })

    return data
  },

  /** Get a signed URL for a private file. */
  async getSignedUrl(path, expiresIn = 3600, bucket = 'documents') {
    if (!isSupabaseConfigured) return null
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)
    if (error) throw error
    return data.signedUrl
  },

  /** Get a public URL for a public file. */
  getPublicUrl(path, bucket = 'avatars') {
    if (!isSupabaseConfigured) return null
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  },

  /** Delete a file. */
  async remove(path, bucket = 'documents') {
    if (!isSupabaseConfigured) return null
    const { error } = await supabase.storage.from(bucket).remove([path])
    if (error) throw error
  },

  /** List files in a folder. */
  async listFiles(folder, bucket = 'documents') {
    if (!isSupabaseConfigured) return []
    const { data, error } = await supabase.storage.from(bucket).list(folder)
    if (error) throw error
    return data || []
  },
}

/* ================================================================
   REALTIME — Subscribe to changes
   ================================================================ */
export const realtimeService = {
  /**
   * Subscribe to INSERT/UPDATE/DELETE on a table for the current company.
   * @returns {{ unsubscribe: Function }}
   */
  subscribe(tableName, companyId, callback) {
    if (!isSupabaseConfigured) return { unsubscribe: () => {} }
    const channel = supabase
      .channel(`${tableName}_${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => callback(payload)
      )
      .subscribe()
    return { unsubscribe: () => supabase.removeChannel(channel) }
  },
}

/* ================================================================
   CONVENIENCE — Check connectivity
   ================================================================ */
export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) return { connected: false, reason: 'not_configured' }
  try {
    const { error } = await supabase.from('companies').select('id').limit(1)
    if (error) return { connected: false, reason: error.message }
    return { connected: true }
  } catch (err) {
    return { connected: false, reason: err.message }
  }
}

export { isSupabaseConfigured }
