import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import StripePricingTable from '../components/StripePricingTable'
import { useSubscriptionStore } from '../services/featureFlags'
import stripeService, { PLANS, BILLING_PERIODS, BILLING_DISCOUNT, getPlanPrice, getBillingLabel, getStorageLabel } from '../services/stripeService'
import { useTransactionStore, getCompanyDomain } from '../store/transactionStore'
import { useAuthStore } from '../store/authStore'
import { analytics } from '../services/analytics'
import { isStripeConfigured } from '../config/stripe'
import { syncSubscriptionFromSupabase } from '../services/stripeService'
import './SubscriptionPlans.css'

const MAX_VISIBLE_FEATURES = 5

export default function SubscriptionPlans() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')
  const [detailPlan, setDetailPlan] = useState(null)
  const currentPlan = useSubscriptionStore((s) => s.planId)
  const accountType = useSubscriptionStore((s) => s.accountType)
  const subStatus = useSubscriptionStore((s) => s.status)
  const storedBilling = useSubscriptionStore((s) => s.billingPeriod)
  const setPlan = useSubscriptionStore((s) => s.setPlan)
  const setBillingPeriodStore = useSubscriptionStore((s) => s.setBillingPeriod)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const transactions = useTransactionStore((s) => s.transactions)
  const user = useAuthStore((s) => s.user)
  const role = useAuthStore((s) => s.role)
  const isSuperAdmin = role === 'superadmin'
  const isCompanyAdmin = role === 'admin' || isSuperAdmin
  const stripeLive = isStripeConfigured
  const showLocalPlanCatalog = !stripeLive

  const [billingPeriod, setBillingPeriod] = useState(storedBilling || BILLING_PERIODS.MONTHLY)

  const handleBillingChange = (period) => {
    setBillingPeriod(period)
    setBillingPeriodStore(period)
  }

  const pendingUpgrade = transactions.find(
    (tx) =>
      tx.type === 'plan_upgrade' &&
      ['requested', 'company_approved', 'pending_platform_approval', 'pending_approval'].includes(tx.status) &&
      tx.userEmail === user?.email
  )
  const pendingStatusLabel = pendingUpgrade
    ? pendingUpgrade.status === 'requested' ? 'Awaiting Company Admin Approval'
    : pendingUpgrade.status === 'company_approved' ? 'Approved — Awaiting Admin Payment'
    : 'Paid — Awaiting STREFEX Approval'
    : ''

  useEffect(() => {
    syncSubscriptionFromSupabase().then((sub) => {
      if (sub?.plan_id && sub.plan_id !== currentPlan) {
        setPlan(sub.plan_id, sub.status || 'active')
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      syncSubscriptionFromSupabase().then((sub) => {
        if (sub?.plan_id) {
          const prevPlan = currentPlan
          setPlan(sub.plan_id, sub.status)
          const plan = PLANS.find((p) => p.id === sub.plan_id)
          if (plan) {
            const price = getPlanPrice(plan, accountType, billingPeriod)
            addTransaction({
              type: plan.tier > (PLANS.find((p) => p.id === prevPlan)?.tier || 0) ? 'plan_upgrade' : 'plan_downgrade',
              service: `Plan ${plan.name} — ${getBillingLabel(billingPeriod)}`,
              amount: price,
              method: 'stripe',
              status: 'paid',
              userEmail: user?.email || 'unknown',
              companyName: user?.companyName || '',
              planFrom: prevPlan,
              planTo: sub.plan_id,
              accountType: accountType || 'seller',
              billingPeriod,
            })
          }
        }
      }).catch(() => {
        stripeService.getSubscription().then((sub) => {
          if (sub?.plan_id) setPlan(sub.plan_id, sub.status)
        })
      })
      analytics.track('checkout_completed')
    }
    if (searchParams.get('canceled') === 'true') {
      analytics.track('checkout_canceled')
    }
  }, [searchParams, setPlan]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubscribe = (planId) => {
    if (planId === 'start') return
    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) return
    setLoading(planId)
    const price = getPlanPrice(plan, accountType, billingPeriod)
    const billingLabel = getBillingLabel(billingPeriod)

    if (isSuperAdmin) {
      const prevPlan = currentPlan
      setPlan(planId, 'active')
      addTransaction({
        type: 'plan_upgrade',
        service: `Plan ${plan.name} — ${billingLabel}`,
        amount: price,
        method: 'platform',
        status: 'paid',
        userEmail: user?.email || 'unknown',
        companyName: user?.companyName || '',
        planFrom: prevPlan,
        planTo: planId,
        accountType: accountType || 'seller',
        billingPeriod,
        platformApprovedBy: user?.email,
        platformApprovedAt: new Date().toISOString(),
      })
      setLoading(null)
      analytics.track('plan_upgrade_direct', { to: planId })
      return
    }

    if (isCompanyAdmin) {
      navigate(`/payment?plan=${planId}&billing=${billingPeriod}`)
      return
    }

    addTransaction({
      type: 'plan_upgrade',
      service: `Plan ${plan.name} — ${billingLabel}`,
      amount: price,
      method: '',
      status: 'requested',
      userEmail: user?.email || 'unknown',
      companyName: user?.companyName || '',
      companyDomain: getCompanyDomain(user?.email),
      planFrom: currentPlan,
      planTo: planId,
      accountType: accountType || 'seller',
      billingPeriod,
      requestedBy: user?.email,
    })
    setLoading(null)
    analytics.track('plan_upgrade_requested', { to: planId })
  }

  const handleManageBilling = async () => {
    setError('')
    const result = await stripeService.openCustomerPortal()
    if (result?.error) setError(result.error)
  }

  const handleQuickStripeCheckout = async (planId) => {
    setError('')
    setLoading(planId)
    const result = await stripeService.checkout(planId)
    if (result?.error) setError(result.error)
    setLoading(null)
  }

  const trialInfo = subStatus === 'trialing'
  const trialDaysLeft = useSubscriptionStore((s) => s.trialDaysLeft)()
  const isTrialExpired = subStatus === 'trial_expired'

  const planAccent = (id) => {
    const colors = { start: '#95a5a6', basic: '#3498db', standard: '#f39c12', premium: '#8e44ad', enterprise: '#000888' }
    return colors[id] || '#999'
  }

  return (
    <AppLayout>
      <div className="app-page sp-page">
        {/* Header */}
        <div className="app-page-card sp-header-card">
          <h2 className="app-page-title">Plans & Pricing</h2>
          <p className="app-page-subtitle">
            {stripeLive
              ? 'Active billing is managed through Stripe plans below.'
              : 'Choose the plan that fits your business. Upgrade or downgrade at any time.'}
          </p>
          {showLocalPlanCatalog && (
            <div className="sp-billing-selector">
              <button className={`sp-billing-opt ${billingPeriod === BILLING_PERIODS.MONTHLY ? 'active' : ''}`} onClick={() => handleBillingChange(BILLING_PERIODS.MONTHLY)}>Monthly</button>
              <button className={`sp-billing-opt ${billingPeriod === BILLING_PERIODS.ANNUAL ? 'active' : ''}`} onClick={() => handleBillingChange(BILLING_PERIODS.ANNUAL)}>Yearly <span className="sp-billing-badge">Save 15%</span></button>
              <button className={`sp-billing-opt ${billingPeriod === BILLING_PERIODS.TRIENNIAL ? 'active' : ''}`} onClick={() => handleBillingChange(BILLING_PERIODS.TRIENNIAL)}>3-Year <span className="sp-billing-badge best">Save 25%</span></button>
            </div>
          )}
        </div>

        {error && <div className="sp-alert">{error}</div>}
        {searchParams.get('success') === 'true' && <div className="sp-alert sp-alert-success">Payment successful! Your plan has been upgraded.</div>}
        {trialInfo && accountType === 'buyer' && (
          <div className="sp-alert sp-alert-info">
            You are on a free trial of the Basic plan. <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining.</strong> Subscribe to continue using platform features after the trial ends.
          </div>
        )}
        {trialInfo && accountType !== 'buyer' && <div className="sp-alert sp-alert-info">You are on a free trial. {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining.</div>}
        {isTrialExpired && (
          <div className="sp-alert" style={{ borderColor: '#e74c3c', background: 'rgba(231,76,60,.06)' }}>
            Your free trial has expired. Subscribe to a plan below to regain access to platform features.
          </div>
        )}
        {pendingUpgrade && (
          <div className="sp-alert sp-alert-info" style={{ borderColor: '#e65100', background: 'rgba(230,81,0,.06)' }}>
            <strong>Upgrade Pending:</strong> Your upgrade to <strong>{PLANS.find((p) => p.id === pendingUpgrade.planTo)?.name}</strong> is: <strong>{pendingStatusLabel}</strong>
          </div>
        )}

        {/* ── Stripe Pricing Table (live checkout) ── */}
        {stripeLive && (
          <div className="app-page-card" style={{ padding: '2rem 1rem' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.1rem', color: '#333' }}>
              Subscribe via Stripe
            </h3>
            <p style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#888' }}>
              Secure checkout powered by Stripe. Select a plan below to subscribe.
            </p>
            <StripePricingTable
              customerEmail={user?.email}
              clientReferenceId={user?.companyId || user?.tenant || ''}
            />
            <div style={{ marginTop: '1rem' }}>
              <p style={{ textAlign: 'center', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#777' }}>
                If the pricing table is slow, use quick checkout:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
                {PLANS.filter((p) => p.price > 0).map((plan) => (
                  <button
                    key={`quick-${plan.id}`}
                    type="button"
                    className="sp-btn sp-btn-outline"
                    style={{ minWidth: 140 }}
                    disabled={loading === plan.id}
                    onClick={() => {
                      if (isCompanyAdmin || isSuperAdmin) {
                        handleQuickStripeCheckout(plan.id)
                      } else {
                        handleSubscribe(plan.id)
                      }
                    }}
                  >
                    {loading === plan.id ? 'Opening...' : `${plan.name} Checkout`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showLocalPlanCatalog && (
          <>
            {/* ── Plan cards — 3 per row ── */}
            <div className="sp-card-grid">
              {PLANS.map((plan) => {
                const price = getPlanPrice(plan, accountType, billingPeriod)
                const monthlyPrice = plan.price
                const isCurrent = plan.id === currentPlan
                const savings = monthlyPrice > 0 && price < monthlyPrice ? Math.round((1 - price / monthlyPrice) * 100) : 0
                const accent = planAccent(plan.id)
                const visibleFeats = plan.features.slice(0, MAX_VISIBLE_FEATURES)
                const hasMore = plan.features.length > MAX_VISIBLE_FEATURES

                return (
                  <div key={plan.id} className={`sp-card ${isCurrent ? 'sp-card-active' : ''} ${plan.popular ? 'sp-card-popular' : ''}`}>
                    {plan.popular && <div className="sp-card-popular-tag">Most Popular</div>}
                    <div className="sp-card-header" style={{ borderColor: accent }}>
                      <span className="sp-card-name" style={{ color: accent }}>{plan.name}</span>
                      {isCurrent && <span className="sp-card-badge current">Current</span>}
                    </div>

                    <div className="sp-card-price-block">
                      {price === 0 ? (
                        <span className="sp-card-price">Free</span>
                      ) : (
                        <span className="sp-card-price">
                          <span className="sp-card-currency">$</span>{price % 1 === 0 ? price : price.toFixed(2)}
                          <span className="sp-card-interval">/mo</span>
                        </span>
                      )}
                      {savings > 0 && (
                        <div className="sp-card-savings">
                          <span className="sp-card-original">${monthlyPrice}/mo</span>
                          <span className="sp-card-save">Save {savings}%</span>
                        </div>
                      )}
                      <div className="sp-card-storage">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="2"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" stroke="currentColor" strokeWidth="2"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" stroke="currentColor" strokeWidth="2"/></svg>
                        {getStorageLabel(plan)}
                      </div>
                    </div>

                    <ul className="sp-card-features">
                      {visibleFeats.map((f, i) => (
                        <li key={i}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    {hasMore && (
                      <button className="sp-learn-more" style={{ color: accent }} onClick={() => setDetailPlan(plan)}>
                        Learn More ({plan.features.length - MAX_VISIBLE_FEATURES} more)
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}

                    <div className="sp-card-action">
                      {isCurrent ? (
                        <button className="sp-btn sp-btn-current" disabled>Current Plan</button>
                      ) : plan.price === 0 ? (
                        <button className="sp-btn sp-btn-outline" onClick={() => {
                          const prevPlan = currentPlan
                          setPlan('start')
                          addTransaction({ type: 'plan_downgrade', service: 'Plan Free — Downgrade', amount: 0, method: 'free', status: 'paid', userEmail: user?.email || 'unknown', companyName: user?.companyName || '', planFrom: prevPlan, planTo: 'start', accountType: accountType || 'seller', billingPeriod: 'monthly' })
                          analytics.track('plan_downgrade', { to: 'start' })
                        }}>Downgrade</button>
                      ) : pendingUpgrade && pendingUpgrade.planTo === plan.id ? (
                        <button className="sp-btn sp-btn-pending" disabled>{pendingStatusLabel || 'Pending'}</button>
                      ) : (
                        <button className={`sp-btn ${plan.popular ? 'sp-btn-primary' : 'sp-btn-outline'}`} onClick={() => handleSubscribe(plan.id)} disabled={loading === plan.id || !!pendingUpgrade}>
                          {loading === plan.id ? 'Processing...' : isCompanyAdmin ? 'Subscribe & Pay' : 'Request Upgrade'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Billing comparison summary */}
            <div className="app-page-card">
              <h3 className="sp-comparison-title">Billing Period Comparison</h3>
              <div className="sp-comparison-table-wrap">
                <table className="sp-comparison-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Monthly</th>
                      <th>Yearly <span className="sp-th-badge">-15%</span></th>
                      <th>3-Year <span className="sp-th-badge best">-25%</span></th>
                      <th>Storage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLANS.map((plan) => (
                      <tr key={plan.id} className={plan.id === currentPlan ? 'sp-tbl-current' : ''}>
                        <td className="sp-td-plan">
                          <span className="sp-td-dot" style={{ background: planAccent(plan.id) }} />
                          {plan.name}
                        </td>
                        <td>{plan.price === 0 ? 'Free' : `$${plan.price}/mo`}</td>
                        <td>{plan.price === 0 ? 'Free' : `$${plan.annualPrice}/mo`}</td>
                        <td>{plan.price === 0 ? 'Free' : `$${plan.triennialPrice}/mo`}</td>
                        <td>{getStorageLabel(plan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {currentPlan !== 'start' && currentPlan !== 'free' && (
          <div className="sp-manage">
            <button className="sp-btn sp-btn-secondary" onClick={handleManageBilling}>Manage Billing & Invoices</button>
          </div>
        )}
      </div>

      {/* ── "Learn More" modal ── */}
      {showLocalPlanCatalog && detailPlan && (
        <div className="sp-modal-overlay" onClick={() => setDetailPlan(null)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sp-modal-close" onClick={() => setDetailPlan(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <div className="sp-modal-header" style={{ borderColor: planAccent(detailPlan.id) }}>
              <h3 className="sp-modal-name" style={{ color: planAccent(detailPlan.id) }}>{detailPlan.name} Plan</h3>
              <span className="sp-modal-price">
                {detailPlan.price === 0 ? 'Free' : `$${getPlanPrice(detailPlan, accountType, billingPeriod)}/mo`}
              </span>
              <span className="sp-modal-storage">{getStorageLabel(detailPlan)}</span>
            </div>
            <h4 className="sp-modal-section-title">All Features</h4>
            <ul className="sp-modal-features">
              {detailPlan.features.map((f, i) => (
                <li key={i}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={planAccent(detailPlan.id)} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {f}
                </li>
              ))}
            </ul>
            <div className="sp-modal-action">
              {detailPlan.id === currentPlan ? (
                <button className="sp-btn sp-btn-current" disabled>Current Plan</button>
              ) : detailPlan.price === 0 ? (
                <button className="sp-btn sp-btn-outline" onClick={() => { handleSubscribe(detailPlan.id); setDetailPlan(null) }}>Downgrade</button>
              ) : (
                <button className="sp-btn sp-btn-primary" onClick={() => { handleSubscribe(detailPlan.id); setDetailPlan(null) }}>
                  {isCompanyAdmin ? 'Subscribe & Pay' : 'Request Upgrade'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
