/**
 * Auth store tests.
 * Validates role hierarchy, token management, and session state.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../store/authStore'

describe('Auth Store', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
    localStorage.clear()
  })

  it('should start unauthenticated', () => {
    const store = useAuthStore.getState()
    expect(store.isAuthenticated).toBe(false)
    expect(store.role).toBe('user')
    expect(store.token).toBe(null)
  })

  it('should login and set auth state', () => {
    useAuthStore.getState().login({
      role: 'admin',
      token: 'test-jwt-token',
      expiresAt: Date.now() + 3600000,
      user: { id: '1', email: 'admin@test.com', fullName: 'Admin', role: 'admin' },
      tenant: { id: 't1', name: 'Test Corp', slug: 'test-corp' },
    })

    const store = useAuthStore.getState()
    expect(store.isAuthenticated).toBe(true)
    expect(store.role).toBe('admin')
    expect(store.token).toBe('test-jwt-token')
    expect(store.user.email).toBe('admin@test.com')
    expect(store.tenant.slug).toBe('test-corp')
  })

  it('should logout and clear state', () => {
    useAuthStore.getState().login({ role: 'user', token: 'tok' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)

    useAuthStore.getState().logout()
    const store = useAuthStore.getState()
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBe(null)
    expect(store.user).toBe(null)
  })

  it('should enforce role hierarchy', () => {
    useAuthStore.getState().login({ role: 'manager' })
    const { hasRole } = useAuthStore.getState()

    expect(hasRole('user')).toBe(true)       // manager >= user
    expect(hasRole('manager')).toBe(true)    // manager >= manager
    expect(hasRole('admin')).toBe(false)     // manager < admin
  })

  it('should check admin role correctly', () => {
    useAuthStore.getState().login({ role: 'admin' })
    const store = useAuthStore.getState()

    expect(store.isAdmin()).toBe(true)
    expect(store.isManager()).toBe(true)  // admin counts as manager
    expect(store.hasRole('user')).toBe(true)
    expect(store.hasRole('admin')).toBe(true)
    expect(store.hasRole('superadmin')).toBe(false) // admin < superadmin
  })

  it('should prevent superadmin escalation without verified superadmin email', () => {
    useAuthStore.getState().login({
      role: 'superadmin',
      user: { id: '1', email: 'user@test.com', fullName: 'User', role: 'superadmin' },
    })
    const store = useAuthStore.getState()

    // Security hardening: superadmin is only allowed for configured STREFEX email.
    // Unverified attempts are downgraded to admin.
    expect(store.role).toBe('admin')
    expect(store.isSuperAdmin()).toBe(false)
    expect(store.isAdmin()).toBe(true)
    expect(store.isManager()).toBe(true)
    expect(store.hasRole('user')).toBe(true)
    expect(store.hasRole('admin')).toBe(true)
    expect(store.hasRole('superadmin')).toBe(false)
  })

  it('should validate token expiry', () => {
    // Valid token
    useAuthStore.getState().login({ token: 'tok', expiresAt: Date.now() + 60000 })
    expect(useAuthStore.getState().isTokenValid()).toBe(true)

    // Expired token
    useAuthStore.getState().login({ token: 'tok', expiresAt: Date.now() - 1000 })
    expect(useAuthStore.getState().isTokenValid()).toBe(false)
  })
})
