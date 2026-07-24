'use client'

import Link from 'next/link'
import { Cookie, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function CookieConsentBanner({
  onAccept,
  onReject,
  onClose,
}: {
  onAccept: () => void
  onReject: () => void
  /** When provided (banner reopened from preferences), shows a dismiss button. */
  onClose?: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
    >
      <div className="glass-card pointer-events-auto relative w-full max-w-3xl rounded-2xl border border-white/10 bg-black/80 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-6">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#888] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-start gap-3 pr-8 sm:pr-0">
            <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF6733]/25 bg-[#FF6733]/[0.06] sm:flex">
              <Cookie className="h-[18px] w-[18px] text-[#FF6733]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="font-headline text-sm font-medium text-white">We use cookies</p>
              <p className="mt-1 font-body text-[13px] leading-relaxed text-[#A1A1AA]">
                Essential cookies run Scout; analytics only with your consent.{' '}
                <Link
                  href="/privacy#cookies"
                  className="text-[#FF6733] underline-offset-2 hover:underline"
                >
                  Cookie Policy
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-stretch gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onReject}
              className="min-h-11 flex-1 whitespace-nowrap"
            >
              Reject
            </Button>
            <Button
              type="button"
              onClick={onAccept}
              className="min-h-11 flex-1 whitespace-nowrap"
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
