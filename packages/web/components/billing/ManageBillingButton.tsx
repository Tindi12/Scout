'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useBillingPortal } from '@/hooks/use-billing-portal'

type ManageBillingButtonProps = {
  /** link = subtle text link (pricing footer); secondary = bordered button. */
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

  return (
    <div className="inline-flex flex-col items-center">
      <Button
        type="button"
        variant={variant === 'secondary' ? 'outline' : 'link'}
        size={variant === 'secondary' ? 'lg' : 'default'}
        onClick={handleClick}
        loading={loading}
        className={
          variant === 'link'
            ? `h-auto px-0 py-0 text-[#A1A1AA] hover:text-white ${className}`
            : className
        }
      >
        {loading ? 'Opening…' : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-1.5 font-body text-[12px] text-[#ef4444]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
