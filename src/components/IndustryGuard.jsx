import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useIndustrySubscriptionStore } from '../services/subscriptionService'

export default function IndustryGuard({ industry, requiredTier = 'free', children }) {
  const location = useLocation()
  const params = useParams()
  const subscriptions = useIndustrySubscriptionStore((s) => s.subscriptions)
  const loading = useIndustrySubscriptionStore((s) => s.loading)

  const targetIndustry = (industry || params.industryId || '').toLowerCase()
  const sub = subscriptions.find((s) => s.industry?.toLowerCase() === targetIndustry && s.status === 'active')

  const levels = { free: 0, basic: 1, standard: 2, premium: 3, enterprise: 4 }
  const userLevel = levels[sub?.tier] ?? -1
  const requiredLevel = levels[requiredTier] ?? 999

  if (loading) return null

  if (!targetIndustry || userLevel >= requiredLevel) {
    return children
  }

  return <Navigate to="/plans" state={{ from: location.pathname, reason: 'upgrade_required' }} replace />
}
