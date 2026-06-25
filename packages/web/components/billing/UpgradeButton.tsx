'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { createCheckoutUrl, type CheckoutTier } from '@/lib/billing'
import { planDisplayLabel } from '@/lib/subscription-plan'

type UpgradeButtonProps = {
  tier: CheckoutTier
  /** primary = full glow CTA (pricing page); compact = small inline pill (gate hits). */
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

  const base =
    'group inline-flex items-center justify-center gap-2 rounded-full font-label font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70'

  const sizing =
    variant === 'primary'
      ? 'h-11 px-6 text-sm shadow-[0_0_24px_rgba(255,103,51,0.4)] hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97]'
      : 'h-9 px-4 text-[13px] shadow-[0_0_18px_rgba(255,103,51,0.3)] hover:shadow-[0_0_26px_rgba(255,103,51,0.5)] active:scale-[0.97]'

  return (
    <div className={fullWidth ? 'w-full' : 'inline-flex flex-col'}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className={`${base} bg-[#FF6733] ${sizing} ${fullWidth ? 'w-full' : ''} ${className}`}
      >
        {loading ? (
          <>
            <Loader2
              className={variant === 'primary' ? 'h-4 w-4 animate-spin' : 'h-3.5 w-3.5 animate-spin'}
              aria-hidden
            />
            Redirecting…
          </>
        ) : (
          <>
            {text}
            {variant === 'compact' ? (
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.5}
                aria-hidden
              />
            ) : null}
          </>
        )}
      </button>
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
