import {
  planBadgeBaseClassName,
  planBadgeClassName,
  planDisplayLabel,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'
import { cn } from '@/lib/utils'

type PlanBadgeProps = {
  plan: SubscriptionPlan
  className?: string
}

export function PlanBadge({ plan, className }: PlanBadgeProps) {
  return (
    <span
      className={cn(planBadgeBaseClassName, planBadgeClassName(plan), className)}
    >
      {planDisplayLabel(plan)}
    </span>
  )
}
