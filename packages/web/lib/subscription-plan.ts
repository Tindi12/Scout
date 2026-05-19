export type SubscriptionPlan = 'free' | 'pro' | 'scout_plus'

export const FREE_APPLICATION_LIMIT = 25
export const PRO_APPLICATION_LIMIT = 200
export const SCOUT_PLUS_APPLICATION_LIMIT = 600

export function normalizeSubscriptionPlan(
  raw: string | null | undefined,
  isPro?: boolean | null,
): SubscriptionPlan {
  const value = raw?.trim().toLowerCase()
  if (value === 'scout_plus' || value === 'scout+' || value === 'scoutplus') {
    return 'scout_plus'
  }
  if (value === 'pro' || isPro) return 'pro'
  if (value === 'free') return 'free'
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
      return 'bg-[#F5C542]/15 text-[#F5C542] shadow-[0_0_10px_rgba(245,197,66,0.22)]'
    case 'pro':
      return 'bg-[#FF6733]/15 text-[#FF6733]'
    default:
      return 'bg-white/[0.06] text-[#888]'
  }
}

export function applicationLimitForPlan(plan: SubscriptionPlan): number {
  switch (plan) {
    case 'scout_plus':
      return SCOUT_PLUS_APPLICATION_LIMIT
    case 'pro':
      return PRO_APPLICATION_LIMIT
    default:
      return FREE_APPLICATION_LIMIT
  }
}

/** Paid tier: Pro features (rewrites, auto-apply, etc.). */
export function hasPaidFeatures(
  plan: SubscriptionPlan,
  isPro?: boolean | null,
): boolean {
  return plan !== 'free' || Boolean(isPro)
}

export function creditsPeriodLabel(plan: SubscriptionPlan): string {
  return plan === 'free' ? 'lifetime' : 'this billing period'
}