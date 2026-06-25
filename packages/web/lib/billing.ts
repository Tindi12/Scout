import type { SubscriptionPlan } from '@/lib/subscription-plan'

export type CheckoutTier = Extract<SubscriptionPlan, 'pro' | 'scout_plus'>

/** Pull a human-readable error string out of a FastAPI `{ detail }` body which
 * may be a plain string or a structured object. */
function readDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message?: unknown }).message === 'string'
    ) {
      return (detail as { message: string }).message
    }
  }
  return fallback
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  })

  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    parsed = null
  }

  if (!res.ok) {
    throw new Error(readDetail(parsed, `Request failed (${res.status})`))
  }
  return parsed
}

/**
 * Start a Stripe Checkout session for the given paid tier and return the hosted
 * Checkout URL. Throws an Error with a user-safe message on failure.
 *
 * This (via UpgradeButton) is the single place checkout is triggered.
 */
export async function createCheckoutUrl(tier: CheckoutTier): Promise<string> {
  const data = await postJson('/api/stripe/create-checkout-session', { tier })
  const url = (data as { url?: unknown } | null)?.url
  if (typeof url !== 'string' || !url) {
    throw new Error('Could not start checkout. Please try again.')
  }
  return url
}

/**
 * Open the Stripe billing portal and return its URL. Throws an Error with a
 * user-safe message on failure (e.g. no active billing account).
 */
export async function createPortalUrl(): Promise<string> {
  const data = await postJson('/api/stripe/create-portal-session')
  const url = (data as { url?: unknown } | null)?.url
  if (typeof url !== 'string' || !url) {
    throw new Error('Could not open billing portal. Please try again.')
  }
  return url
}
