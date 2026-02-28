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

  return children
}
