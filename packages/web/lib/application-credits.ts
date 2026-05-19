import {
  applicationLimitForPlan,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'

export type ApplicationCreditsSnapshot = {
  plan: SubscriptionPlan
  limit: number
  used: number
  remaining: number
  isPaid: boolean
}

export function buildApplicationCredits(
  plan: SubscriptionPlan,
  used: number,
): ApplicationCreditsSnapshot {
  const limit = applicationLimitForPlan(plan)
  return {
    plan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    isPaid: plan !== 'free',
  }
}
