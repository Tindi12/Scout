import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
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
  // Funnel step: the user committed to paying. The authoritative paid event
  // (subscription_activated) is fired server-side from the Stripe webhook.
  track(ANALYTICS_EVENTS.CHECKOUT_STARTED, { tier })
  const data = await postJson('/api/stripe/create-checkout-session', { tier })
  const url = (data as { url?: unknown } | null)?.url
  if (typeof url !== 'string' || !url) {
    throw new Error('Could not start checkout. Please try again.')
  }
  return url
}

/** Thrown by changePlanTo when there is no live subscription to modify — the
 * caller should fall back to the Checkout flow (createCheckoutUrl). */
export class NoSubscriptionError extends Error {
  constructor() {
    super('No active subscription to change')
    this.name = 'NoSubscriptionError'
  }
}

function isUseCheckoutBody(body: unknown): boolean {
  if (!body || typeof body !== 'object' || !('detail' in body)) return false
  const detail = (body as { detail?: unknown }).detail
  return (
    typeof detail === 'object' &&
    detail !== null &&
    (detail as { action?: unknown }).action === 'use_checkout'
  )
}

/**
 * Switch an existing subscriber's plan in place (Stripe subscription price swap
 * with proration — upgrades charge the prorated difference immediately). Returns
 * the new plan. Throws NoSubscriptionError when the caller has no live
 * subscription (route them through Checkout instead), or a user-safe Error.
 */
export async function changePlanTo(tier: CheckoutTier): Promise<string> {
  track(ANALYTICS_EVENTS.PLAN_CHANGE_STARTED, { tier })
  const res = await fetch('/api/stripe/change-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
    cache: 'no-store',
  })

  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    parsed = null
  }

  if (!res.ok) {
    if (res.status === 409 && isUseCheckoutBody(parsed)) {
      throw new NoSubscriptionError()
    }
    throw new Error(readDetail(parsed, `Plan change failed (${res.status})`))
  }

  const plan = (parsed as { subscription_plan?: unknown } | null)
    ?.subscription_plan
  if (typeof plan !== 'string' || !plan) {
    throw new Error('Plan change did not complete. Please try again.')
  }
  return plan
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
  track(ANALYTICS_EVENTS.BILLING_PORTAL_OPENED)
  return url
}
