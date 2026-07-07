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
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="glass-card pointer-events-auto relative w-full max-w-3xl rounded-2xl border border-white/10 bg-black/80 p-5 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-6">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="absolute right-3 top-3 rounded-full p-1.5 text-[#888] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF6733]/25 bg-[#FF6733]/[0.06]">
              <Cookie className="h-[18px] w-[18px] text-[#FF6733]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2 className="font-headline text-sm font-medium text-white">
                We use cookies
              </h2>
              <p className="mt-1 font-body text-[13px] leading-relaxed text-[#A1A1AA]">
                Scout uses essential cookies to run the app and, with your consent,
                analytics cookies to improve it. See our{' '}
                <Link
                  href="/privacy"
                  className="text-[#FF6733] underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>{' '}
                and{' '}
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

          <div className="flex shrink-0 items-center gap-2.5 sm:flex-col sm:items-stretch md:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onReject}
              className="h-10 flex-1 whitespace-nowrap"
            >
              Reject
            </Button>
            <Button
              type="button"
              onClick={onAccept}
              className="h-10 flex-1 whitespace-nowrap"
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
