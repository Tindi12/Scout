'use client'

import Link from 'next/link'

import { ManageBillingButton } from '@/components/billing/ManageBillingButton'
import { UpgradeButton } from '@/components/billing/UpgradeButton'
import {
  planDisplayLabel,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'

export type Viewer = {
  isSignedIn: boolean
  plan: SubscriptionPlan | null
  loading: boolean
}

type PlanCtaProps = {
  tierId: SubscriptionPlan
  viewer: Viewer
  /** card = prominent full-width controls; chart = compact controls. */
  placement?: 'card' | 'chart'
}

/**
 * Renders the correct action for one pricing tier given the viewer's auth +
 * subscription state. Centralizes the three-state logic so cards and the
 * comparison chart never diverge:
 *   - logged out -> "Get Started" (sign up)
 *   - logged-in free -> upgrade buttons / "Current plan" on Free
 *   - logged-in paid -> "Current plan" on their tier, upgrade/downgrade elsewhere
 */
export function PlanCta({ tierId, viewer, placement = 'card' }: PlanCtaProps) {
  const isCard = placement === 'card'
  const isPaidTier = tierId !== 'free'

  if (viewer.loading) {
    return (
      <div
        aria-hidden
        className={`${
          isCard ? 'h-11 w-full' : 'h-9 w-full'
        } animate-pulse rounded-full bg-white/[0.05]`}
      />
    )
  }

  // ---- Logged out: everything routes to sign-up ----
  if (!viewer.isSignedIn) {
    const ghost =
      'inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] font-label font-medium text-white transition-all duration-200 hover:bg-white/[0.1] active:scale-[0.97]'
    const solid =
      'inline-flex items-center justify-center rounded-full bg-[#FF6733] font-label font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.4)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97]'
    const size = isCard ? 'h-11 w-full px-6 text-sm' : 'h-9 w-full px-4 text-[13px]'
    return (
      <Link
        href="/sign-up"
        prefetch
        className={`${isPaidTier ? solid : ghost} ${size}`}
      >
        Get Started
      </Link>
    )
  }

  const plan = viewer.plan ?? 'free'

  // ---- Their current tier ----
  if (plan === tierId) {
    return (
      <div
        className={`inline-flex items-center justify-center gap-2 rounded-full border border-[#FF6733]/30 bg-[#FF6733]/[0.08] font-label font-medium text-[#FF8A5C] ${
          isCard ? 'h-11 w-full px-6 text-sm' : 'h-9 w-full px-4 text-[13px]'
        }`}
      >
        Current plan
      </div>
    )
  }

  // ---- First-time subscribe: ONLY a free viewer goes through Checkout ----
  // Checkout creates a NEW subscription, so it must never run for someone who already
  // has one — that would create a second subscription and double-charge them.
  if (plan === 'free' && isPaidTier) {
    return (
      <UpgradeButton
        tier={tierId}
        variant={isCard ? 'primary' : 'compact'}
        fullWidth
        label={`Upgrade to ${planDisplayLabel(tierId)}`}
      />
    )
  }

  // ---- Existing paid subscriber changing tiers (up, down, or to Free) -> Stripe ----
  // portal, which MODIFIES the existing subscription (swaps the price with proration)
  // instead of creating a new one. The customer.subscription.updated webhook then syncs
  // subscription_plan to the new tier.
  const switchLabel =
    tierId === 'free'
      ? 'Downgrade to Free'
      : `Switch to ${planDisplayLabel(tierId)}`
  return (
    <ManageBillingButton
      variant="secondary"
      label={switchLabel}
      className={isCard ? 'w-full' : 'w-full !h-9 !px-4 !text-[13px]'}
    />
  )
}
