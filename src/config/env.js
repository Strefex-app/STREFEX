/**
 * Centralized environment configuration.
 * All env vars are read once and exported as a typed object.
 * Defaults are provided for local development.
 */
const env = {
  /* ── API ──────────────────────────────────────────────── */
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api/v1',

  /* ── Supabase ─────────────────────────────────────────── */
  SUPABASE_URL:      import.meta.env.VITE_SUPABASE_URL      || '',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',

  /* ── Firebase ─────────────────────────────────────────── */
  FIREBASE_API_KEY:              import.meta.env.VITE_FIREBASE_API_KEY             || '',
  FIREBASE_AUTH_DOMAIN:          import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || '',
  FIREBASE_PROJECT_ID:           import.meta.env.VITE_FIREBASE_PROJECT_ID          || '',
  FIREBASE_STORAGE_BUCKET:       import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || '',
  FIREBASE_MESSAGING_SENDER_ID:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID:               import.meta.env.VITE_FIREBASE_APP_ID              || '',

  /* ── Stripe ───────────────────────────────────────────── */
  STRIPE_PUBLISHABLE_KEY:   import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY   || '',
  STRIPE_PRICING_TABLE_ID:  import.meta.env.VITE_STRIPE_PRICING_TABLE_ID  || '',

  /* ── Mixpanel ─────────────────────────────────────────── */
  MIXPANEL_TOKEN: import.meta.env.VITE_MIXPANEL_TOKEN || '',

  /* ── General ──────────────────────────────────────────── */
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD,
}

export default env
