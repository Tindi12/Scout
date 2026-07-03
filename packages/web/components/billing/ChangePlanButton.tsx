'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

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
  /** primary = glow CTA; secondary = bordered pill. */
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

  const styles =
    variant === 'primary'
      ? 'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.4)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70'
      : 'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-medium text-[#bbb] transition-all duration-200 hover:border-[#FF6733]/40 hover:bg-[#FF6733]/[0.06] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70'

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className={`${styles} ${className}`}
      >
        {text}
      </button>

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
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-medium text-[#bbb] transition-all duration-200 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              Keep current plan
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.4)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Switching…
                </>
              ) : (
                `Confirm switch to ${tierLabel}`
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
