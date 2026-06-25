'use client'

import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

import { SecuredByStripe } from '@/components/billing/SecuredByStripe'
import { UpgradeCTA } from '@/components/billing/UpgradeButton'
import { useTier } from '@/hooks/use-tier'
import type { CheckoutTier } from '@/lib/billing'
import { planDisplayLabel, type SubscriptionPlan } from '@/lib/subscription-plan'

const RANK: Record<SubscriptionPlan, number> = {
  free: 0,
  pro: 1,
  scout_plus: 2,
}

function meetsTier(plan: SubscriptionPlan, required: CheckoutTier): boolean {
  return RANK[plan] >= RANK[required]
}

type RequiresPaidProps = {
  /** Minimum tier needed to see the children. Defaults to Pro. */
  requiredTier?: CheckoutTier
  children: ReactNode
  /** Custom locked UI; defaults to the standard LockedFeature card. */
  fallback?: ReactNode
  title?: string
  description?: string
}

/**
 * 10.6 — gate a paid feature in the UI. Renders children when the viewer is
 * entitled, otherwise a locked state with a compact upgrade CTA.
 */
export function RequiresPaid({
  requiredTier = 'pro',
  children,
  fallback,
  title,
  description,
}: RequiresPaidProps) {
  const { plan, loading } = useTier()

  if (loading) {
    return (
      <div
        aria-hidden
        className="h-24 w-full animate-pulse rounded-2xl bg-white/[0.03]"
      />
    )
  }

  if (plan && meetsTier(plan, requiredTier)) {
    return <>{children}</>
  }

  if (fallback) return <>{fallback}</>

  return (
    <LockedFeature
      requiredTier={requiredTier}
      title={title}
      description={description}
    />
  )
}

type LockedFeatureProps = {
  requiredTier?: CheckoutTier
  title?: string
  description?: string
  className?: string
}

/**
 * Standalone locked-state card. Use directly when you want the lock UI without
 * the conditional wrapper (e.g. inside an already-gated branch).
 */
export function LockedFeature({
  requiredTier = 'pro',
  title,
  description,
  className = '',
}: LockedFeatureProps) {
  const tierLabel = planDisplayLabel(requiredTier)
  return (
    <div
      className={`glass-card flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] p-8 text-center ${className}`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF6733]/10 ring-1 ring-inset ring-[#FF6733]/25">
        <Lock className="h-5 w-5 text-[#FF6733]" strokeWidth={2} />
      </span>
      <div>
        <h3 className="font-headline text-lg font-medium tracking-[-0.01em] text-white">
          {title ?? `${tierLabel} feature`}
        </h3>
        <p className="mx-auto mt-1.5 max-w-sm font-body text-sm leading-relaxed text-[#A1A1AA]">
          {description ??
            `Upgrade to ${tierLabel} to unlock this. You can cancel anytime.`}
        </p>
      </div>
      <UpgradeCTA tier={requiredTier} />
      <SecuredByStripe />
    </div>
  )
}
