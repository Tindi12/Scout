'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { useBillingPortal } from '@/hooks/use-billing-portal'

type ManageBillingButtonProps = {
  /** link = subtle text link (pricing footer); secondary = bordered pill button. */
  variant?: 'link' | 'secondary'
  label?: string
  className?: string
}

/**
 * The single source of Stripe billing-portal triggering. Opens the customer
 * portal so paid users can update payment methods, upgrade/downgrade, or cancel.
 */
export function ManageBillingButton({
  variant = 'link',
  label = 'Manage billing',
  className = '',
}: ManageBillingButtonProps) {
  const { openPortal, loading } = useBillingPortal()
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (loading) return
    setError(null)
    try {
      await openPortal()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open billing portal. Please try again.',
      )
    }
  }

  const styles =
    variant === 'secondary'
      ? 'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-medium text-[#bbb] transition-all duration-200 hover:border-[#FF6733]/40 hover:bg-[#FF6733]/[0.06] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70'
      : 'inline-flex items-center justify-center gap-1.5 font-label text-sm font-medium text-[#A1A1AA] underline-offset-4 transition-colors hover:text-white hover:underline disabled:cursor-not-allowed disabled:opacity-70'

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className={`${styles} ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Opening…
          </>
        ) : (
          label
        )}
      </button>
      {error ? (
        <p role="alert" className="mt-1.5 font-body text-[12px] text-[#ef4444]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
