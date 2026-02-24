/**
 * Superadmin Authentication — STREFEX Platform Administration
 *
 * The superadmin role belongs EXCLUSIVELY to STREFEX administration.
 * - Only the registered STREFEX superadmin email can log in as superadmin
 * - Only an existing superadmin can promote another account to superadmin
 * - Company admins CANNOT self-escalate to superadmin
 *
 * Credentials are read from environment variables (VITE_SA_EMAIL, VITE_SA_PASS_HASH).
 */

const SUPERADMIN_EMAIL = (import.meta.env.VITE_SA_EMAIL || '').trim().toLowerCase()
const SA_PASS_HASH     = (import.meta.env.VITE_SA_PASS_HASH || '').trim()

function verifyPassword(password) {
  if (!SA_PASS_HASH) return false
  try {
    return password === atob(SA_PASS_HASH)
  } catch {
    return false
  }
}

/**
 * Check whether an email address is the registered STREFEX superadmin.
 */
export function isSuperadminEmail(email) {
  if (!SUPERADMIN_EMAIL) return false
  return email?.trim().toLowerCase() === SUPERADMIN_EMAIL
}

/**
 * Validate superadmin credentials (email + password).
 */
export function validateSuperadminCredentials(email, password) {
  if (!isSuperadminEmail(email)) return false
  return verifyPassword(password)
}

export function canAssignSuperadmin(currentRole) {
  return currentRole === 'superadmin'
}

export function getSuperadminEmail() {
  return SUPERADMIN_EMAIL
}

export function changeSuperadminPassword(_currentPassword, _newPassword) {
  // Password changes must go through the backend / Supabase auth in production.
  return false
}
