import { normalizeSubscriptionPlan } from '@/lib/subscription-plan'

import type { CheckoutTier } from '@/lib/billing'

export type UpgradeRequired = {
  requiredTier: CheckoutTier
  message: string
}

/** FastAPI nests the structured payload under `detail`; some callers pass the
 * detail object directly. Accept both shapes. */
function extractDetail(body: unknown): unknown {
  if (body && typeof body === 'object' && 'detail' in body) {
    return (body as { detail?: unknown }).detail
  }
  return body
}

/**
 * Detect the backend's `403 { detail: { error: "upgrade_required", required_tier,
 * message } }` shape and normalize it. Returns null for anything else so callers
 * can fall through to their normal error handling.
 */
export function parseUpgradeRequired(
  status: number,
  body: unknown,
): UpgradeRequired | null {
  if (status !== 403) return null

  const detail = extractDetail(body)
  if (!detail || typeof detail !== 'object') return null

  const d = detail as Record<string, unknown>
  if (d.error !== 'upgrade_required') return null

  const normalized = normalizeSubscriptionPlan(
    typeof d.required_tier === 'string' ? d.required_tier : null,
  )
  const requiredTier: CheckoutTier =
    normalized === 'scout_plus' ? 'scout_plus' : 'pro'
  const message =
    typeof d.message === 'string' && d.message.trim()
      ? d.message
      : 'This feature requires an upgrade.'

  return { requiredTier, message }
}

/**
 * Convenience wrapper: read a fetch Response (clone so the body stays usable for
 * the caller) and return the upgrade payload if it is a 403 upgrade_required.
 */
export async function parseUpgradeRequiredFromResponse(
  res: Response,
): Promise<UpgradeRequired | null> {
  if (res.status !== 403) return null
  try {
    const body = (await res.clone().json()) as unknown
    return parseUpgradeRequired(res.status, body)
  } catch {
    return null
  }
}
