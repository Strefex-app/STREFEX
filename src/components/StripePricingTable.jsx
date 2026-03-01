import { useEffect, useRef, useState } from 'react'
import env from '../config/env'

const SCRIPT_SRC = 'https://js.stripe.com/v3/pricing-table.js'
const LOAD_TIMEOUT_MS = 20000

/**
 * Embeds Stripe's hosted Pricing Table.
 * Loads the external script once and renders the <stripe-pricing-table> custom element.
 *
 * @param {{ customerEmail?: string, clientReferenceId?: string }} props
 */
export default function StripePricingTable({ customerEmail, clientReferenceId }) {
  const containerRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error | timeout
  const [retrySeed, setRetrySeed] = useState(0)

  useEffect(() => {
    if (!env.STRIPE_PRICING_TABLE_ID || !env.STRIPE_PUBLISHABLE_KEY) {
      setStatus('error')
      return
    }

    setStatus('loading')
    const timeoutId = window.setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'timeout' : prev))
    }, LOAD_TIMEOUT_MS)

    let script = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
    const handleLoad = () => setStatus('ready')
    const handleError = () => setStatus('error')

    if (!script) {
      script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.addEventListener('load', handleLoad)
      script.addEventListener('error', handleError)
      document.head.appendChild(script)
    } else if (window.customElements?.get('stripe-pricing-table')) {
      setStatus('ready')
    } else if (script.dataset.loaded === 'true') {
      setStatus('ready')
    } else {
      script.addEventListener('load', handleLoad)
      script.addEventListener('error', handleError)
    }

    script.dataset.loaded = script.dataset.loaded || 'false'
    const markLoaded = () => { script.dataset.loaded = 'true' }
    script.addEventListener('load', markLoaded)

    const el = document.createElement('stripe-pricing-table')
    el.setAttribute('pricing-table-id', env.STRIPE_PRICING_TABLE_ID)
    el.setAttribute('publishable-key', env.STRIPE_PUBLISHABLE_KEY)
    if (customerEmail) el.setAttribute('customer-email', customerEmail)
    if (clientReferenceId) el.setAttribute('client-reference-id', clientReferenceId)

    const container = containerRef.current
    if (container) {
      container.innerHTML = ''
      container.appendChild(el)
    }

    return () => {
      clearTimeout(timeoutId)
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
      script?.removeEventListener('load', markLoaded)
      if (container) container.innerHTML = ''
    }
  }, [customerEmail, clientReferenceId, retrySeed])

  if (!env.STRIPE_PRICING_TABLE_ID || !env.STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="sp-alert" style={{ margin: 0 }}>
        Stripe pricing table is not configured. Please set `VITE_STRIPE_PRICING_TABLE_ID`.
      </div>
    )
  }

  return (
    <div>
      {status === 'loading' && (
        <div className="sp-alert sp-alert-info" style={{ marginBottom: '1rem' }}>
          Loading Stripe plans...
        </div>
      )}
      {status === 'timeout' && (
        <div className="sp-alert" style={{ marginBottom: '1rem' }}>
          Stripe plans are taking too long to load. You can still use quick checkout buttons below.
          <button
            type="button"
            onClick={() => setRetrySeed((v) => v + 1)}
            style={{
              marginLeft: 10,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #d0d0d0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
      {status === 'error' && (
        <div className="sp-alert" style={{ marginBottom: '1rem' }}>
          Could not load Stripe pricing table. Please try again or use quick checkout buttons below.
          <button
            type="button"
            onClick={() => setRetrySeed((v) => v + 1)}
            style={{
              marginLeft: 10,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #d0d0d0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
      <div ref={containerRef} className="stripe-pricing-table-wrapper" />
    </div>
  )
}
