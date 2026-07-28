'use client'

import Link from 'next/link'

import { ChangePlanButton } from '@/components/billing/ChangePlanButton'
import { ManageBillingButton } from '@/components/billing/ManageBillingButton'
import { UpgradeButton } from '@/components/billing/UpgradeButton'
import { ComingSoonCta } from '@/components/landing/waitlist'
import { Button } from '@/components/ui/button'
import {
  planDisplayLabel,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'
import { isWaitlistMode } from '@/lib/waitlist-mode'

export type Viewer = {
  isSignedIn: boolean
  plan: SubscriptionPlan | null
  loading: boolean
  /** Re-reads the plan after an in-place plan change (optional). */
  refetch?: () => Promise<unknown>
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
 *   - waitlist mode (logged out) -> "Join waitlist now" dialog
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
          isCard ? 'h-10 w-full' : 'h-9 w-full'
        } animate-pulse rounded-md bg-white/[0.05]`}
      />
    )
  }

  // ---- Soft launch: public signup closed ----
  if (isWaitlistMode() && !viewer.isSignedIn) {
    return (
      <ComingSoonCta
        source={`pricing_page_${tierId}`}
        variant={isPaidTier ? 'default' : 'outline'}
        size={isCard ? 'lg' : 'default'}
        className="w-full"
      />
    )
  }

  // ---- Logged out: everything routes to sign-up ----
  if (!viewer.isSignedIn) {
    return (
      <Button
        asChild
        variant={isPaidTier ? 'default' : 'outline'}
        size={isCard ? 'lg' : 'default'}
        className="w-full"
      >
        <Link href="/sign-up" prefetch>
          Get Started
        </Link>
      </Button>
    )
  }

  const plan = viewer.plan ?? 'free'

  // ---- Their current tier ----
  if (plan === tierId) {
    return (
      <div
        className={`inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/[0.08] font-label font-medium text-[#FF8A5C] ${
          isCard ? 'h-10 w-full px-6 text-sm' : 'h-9 w-full px-4 text-[13px]'
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

  // ---- Existing paid subscriber moving to Free -> Stripe portal (cancel) ----
  if (tierId === 'free') {
    return (
      <ManageBillingButton
        variant="secondary"
        label="Downgrade to Free"
        className={isCard ? 'w-full' : 'w-full !h-9 !px-4 !text-[13px]'}
      />
    )
  }

  // ---- Existing paid subscriber switching paid tiers -> in-place plan change ----
  // ChangePlanButton MODIFIES the live subscription (price swap with proration;
  // upgrades charge the card on file immediately) instead of creating a second one.
  // The billing portal is not configured for plan switching, so it must not be the
  // switch path.
  return (
    <ChangePlanButton
      tier={tierId}
      direction={tierId === 'scout_plus' ? 'upgrade' : 'downgrade'}
      variant={tierId === 'scout_plus' ? 'primary' : 'secondary'}
      label={`Switch to ${planDisplayLabel(tierId)}`}
      className={isCard ? 'w-full' : 'w-full !h-9 !px-4 !text-[13px]'}
      onChanged={() => void viewer.refetch?.()}
    />
  )
}
