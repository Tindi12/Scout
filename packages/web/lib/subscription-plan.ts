export type SubscriptionPlan = 'free' | 'pro' | 'scout_plus'

export const FREE_APPLICATION_LIMIT = 25
export const PRO_APPLICATION_LIMIT = 200
export const SCOUT_PLUS_APPLICATION_LIMIT = 600

/**
 * Coerce a raw subscription_plan value to a canonical tier string. Defends
 * against legacy casing / synonyms; unknown values fall back to 'free' (the
 * safe, least-privileged tier). subscription_plan is now the single source of
 * truth — the old is_pro boolean was removed.
 */
export function normalizeSubscriptionPlan(
  raw: string | null | undefined,
): SubscriptionPlan {
  const value = raw?.trim().toLowerCase()
  if (value === 'scout_plus' || value === 'scout+' || value === 'scoutplus') {
    return 'scout_plus'
  }
  if (value === 'pro') return 'pro'
  return 'free'
}

export function planDisplayLabel(plan: SubscriptionPlan): string {
  switch (plan) {
    case 'scout_plus':
      return 'Scout+'
    case 'pro':
      return 'Pro'
    default:
      return 'Free'
  }
}

export function planBadgeClassName(plan: SubscriptionPlan): string {
  switch (plan) {
    case 'scout_plus':
      return 'bg-[#F5C542]/15 text-[#F5C542]'
    case 'pro':
      return 'bg-[#FF6733]/15 text-[#FF6733]'
    default:
      return 'bg-white/[0.06] text-[#888]'
  }
}

export type TierLimits = {
  applicationLimit: number
  copilotUnlimited: boolean
}

/** Per-tier limits in one place. Use for anything that differs BY tier so pro
 * and scout_plus are never collapsed together. */
export function tierLimits(plan: SubscriptionPlan): TierLimits {
  switch (plan) {
    case 'scout_plus':
      return {
        applicationLimit: SCOUT_PLUS_APPLICATION_LIMIT,
        copilotUnlimited: true,
      }
    case 'pro':
      return { applicationLimit: PRO_APPLICATION_LIMIT, copilotUnlimited: true }
    default:
      return { applicationLimit: FREE_APPLICATION_LIMIT, copilotUnlimited: false }
  }
}

export function applicationLimitForPlan(plan: SubscriptionPlan): number {
  return tierLimits(plan).applicationLimit
}

/** Binary paid-vs-free gate (Pro features: rewrites, auto-apply, etc.). Use for
 * paid-vs-free decisions only — never to distinguish pro from scout_plus. */
export function isPaidUser(plan: SubscriptionPlan): boolean {
  return plan !== 'free'
}

export function creditsPeriodLabel(plan: SubscriptionPlan): string {
  return plan === 'free' ? 'lifetime' : 'this billing period'
}
