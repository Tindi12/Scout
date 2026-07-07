'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  changePlanTo,
  createCheckoutUrl,
  NoSubscriptionError,
  type CheckoutTier,
} from '@/lib/billing'
import { planDisplayLabel } from '@/lib/subscription-plan'

type ChangePlanButtonProps = {
  /** The paid tier to switch the subscriber to. */
  tier: CheckoutTier
  /** Whether this switch charges now (upgrade) or credits (downgrade) — drives
   * the confirmation copy. */
  direction: 'upgrade' | 'downgrade'
  /** primary = solid brand CTA; secondary = bordered button. */
  variant?: 'primary' | 'secondary'
  label?: string
  className?: string
  /** Called with the new plan after a successful in-place switch. */
  onChanged?: (plan: string) => void
}

/**
 * 10.9 — the single source of in-app plan switching for existing subscribers.
 * Confirms, then modifies the live Stripe subscription in place (proration; an
 * upgrade charges the card on file immediately — no Checkout redirect). If the
 * caller turns out to have no live subscription (e.g. their cancelled plan
 * already ended), falls back to hosted Checkout automatically.
 */
export function ChangePlanButton({
  tier,
  direction,
  variant = 'primary',
  label,
  className = '',
  onChanged,
}: ChangePlanButtonProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tierLabel = planDisplayLabel(tier)
  const text = label ?? `Upgrade to ${tierLabel}`

  const handleConfirm = async () => {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const plan = await changePlanTo(tier)
      setOpen(false)
      toast({
        title: `You're on ${tierLabel} now`,
        description:
          direction === 'upgrade'
            ? 'The prorated difference was charged to your card on file.'
            : 'Your prorated credit will apply to future invoices.',
        duration: 4000,
      })
      onChanged?.(plan)
    } catch (err) {
      if (err instanceof NoSubscriptionError) {
        // No live subscription to modify — start a fresh Checkout instead.
        try {
          window.location.href = await createCheckoutUrl(tier)
          return
        } catch (checkoutErr) {
          setError(
            checkoutErr instanceof Error
              ? checkoutErr.message
              : 'Could not start checkout. Please try again.',
          )
        }
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not change your plan. Please try again.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant === 'primary' ? 'default' : 'outline'}
        size="lg"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className={className}
      >
        {text}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
      >
        <DialogContent className="border-white/10 bg-[#111113] text-white sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg text-white">
              Switch to {tierLabel}?
            </DialogTitle>
            <DialogDescription className="text-sm text-[#A1A1AA]">
              {direction === 'upgrade'
                ? `Your plan changes immediately and the prorated difference for the rest of this billing period is charged to your card on file. Any pending cancellation is removed.`
                : `Your plan changes immediately. The unused portion of your current plan is credited to your account and applies to future invoices.`}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p role="alert" className="font-body text-[13px] text-[#ef4444]">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Keep current plan
            </Button>
            <Button type="button" onClick={handleConfirm} loading={busy}>
              {busy ? 'Switching…' : `Confirm switch to ${tierLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
