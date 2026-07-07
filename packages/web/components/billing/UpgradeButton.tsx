'use client'

import { ArrowRight } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createCheckoutUrl, type CheckoutTier } from '@/lib/billing'
import { planDisplayLabel } from '@/lib/subscription-plan'

type UpgradeButtonProps = {
  tier: CheckoutTier
  /** primary = large CTA (pricing page); compact = small inline button (gate hits). */
  variant?: 'primary' | 'compact'
  label?: string
  fullWidth?: boolean
  className?: string
}

/**
 * 10.8 — the single source of Stripe checkout triggering. Every "upgrade" entry
 * point in the app routes through this component: it creates a Checkout session
 * and redirects the browser to the hosted Stripe page. Nothing else calls
 * /api/stripe/create-checkout-session directly.
 */
export function UpgradeButton({
  tier,
  variant = 'primary',
  label,
  fullWidth = false,
  className = '',
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const url = await createCheckoutUrl(tier)
      // Hand off to Stripe's hosted Checkout. Keep loading=true so the button
      // stays disabled through the navigation.
      window.location.href = url
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start checkout. Please try again.',
      )
      setLoading(false)
    }
  }

  const text = label ?? `Upgrade to ${planDisplayLabel(tier)}`

  return (
    <div className={fullWidth ? 'w-full' : 'inline-flex flex-col'}>
      <Button
        type="button"
        onClick={handleClick}
        loading={loading}
        size={variant === 'primary' ? 'lg' : 'sm'}
        className={cn('group', fullWidth && 'w-full', className)}
      >
        {loading ? (
          'Redirecting…'
        ) : (
          <>
            {text}
            {variant === 'compact' ? (
              <ArrowRight
                className="transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.5}
                aria-hidden
              />
            ) : null}
          </>
        )}
      </Button>
      {error ? (
        <p
          role="alert"
          className={`font-body text-[12px] text-[#ef4444] ${
            variant === 'primary' ? 'mt-2 text-center' : 'mt-1.5'
          }`}
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Compact convenience wrapper for inside-app gate hits (locked states, dialogs).
 * Same checkout logic as UpgradeButton, smaller styling.
 */
export function UpgradeCTA({
  tier,
  label,
  fullWidth,
  className,
}: Omit<UpgradeButtonProps, 'variant'>) {
  return (
    <UpgradeButton
      tier={tier}
      variant="compact"
      label={label}
      fullWidth={fullWidth}
      className={className}
    />
  )
}
