import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/**
 * Wraps a route element:
 *   - Redirects to /login when not authenticated (or session expired)
 *   - Optionally checks `requiredRole` (admin > manager > user)
 *   - Shows "403 Forbidden" when role is insufficient
 *   - Preserves the intended URL so login can redirect back
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const hasRole = useAuthStore((s) => s.hasRole)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  // Token expired — force logout and redirect
  if (isAuthenticated && expiresAt && Date.now() > expiresAt) {
    logout()
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 16, color: '#666',
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ color: '#e74c3c' }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h2 style={{ margin: 0, color: '#333', fontSize: 20 }}>Access Denied</h2>
        <p style={{ margin: 0, fontSize: 14 }}>
          You don't have permission to view this page. Contact your administrator.
        </p>
      </div>
    )
  }

  return children
}
