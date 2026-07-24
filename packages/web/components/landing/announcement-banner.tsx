import Link from 'next/link'

import { ComingSoonCta } from '@/components/landing/waitlist'
import { isWaitlistMode } from '@/lib/waitlist-mode'

/**
 * Slim premium beta announcement for the marketing landing page.
 * Document-flow (not sticky) so it scrolls away and the fixed nav settles to the top.
 */
export function AnnouncementBanner() {
  const waitlist = isWaitlistMode()

  return (
    <div
      id="announcement-banner"
      className="announcement-banner relative z-[55] isolate overflow-hidden border-b border-white/[0.08]"
      role="region"
      aria-label="Product announcement"
    >
      <div aria-hidden className="announcement-banner-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="announcement-banner-lines pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-[60%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,103,51,0.12)_0%,transparent_70%)] opacity-70"
      />

      <div className="announcement-banner-inner relative mx-auto flex min-h-[44px] max-w-7xl flex-col items-center justify-center gap-2 px-4 py-2.5 sm:min-h-[48px] sm:flex-row sm:gap-4 sm:px-6 lg:px-12">
        <p className="max-w-2xl text-center font-body text-[13px] leading-snug tracking-[0.01em] text-[#D4D4D8] sm:flex-1 sm:text-[13.5px]">
          {waitlist ? (
            <>
              <span className="text-white">Scout is in private beta.</span>
              <span className="text-[#A1A1AA]">
                {' '}
                Public access isn&apos;t open yet — join the waitlist for a seat.
              </span>
            </>
          ) : (
            <>
              <span className="text-white">Scout is now in Beta!</span>
              <span className="text-[#A1A1AA]">
                {' '}
                Our AI-powered applications are improving every week.
              </span>
            </>
          )}
        </p>

        {waitlist ? (
          <ComingSoonCta
            source="banner"
            label="Join waitlist"
            size="sm"
            className="shrink-0 !h-8 px-3 text-[12px]"
          />
        ) : (
          <Link
            href="/blog"
            className="announcement-banner-cta font-label group inline-flex shrink-0 items-center gap-1 text-[12px] font-medium tracking-[0.04em] text-[#FF6733] transition-all duration-200 hover:gap-1.5 hover:text-[#ff8254]"
          >
            Learn more
            <span
              aria-hidden
              className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        )}
      </div>
    </div>
  )
}
