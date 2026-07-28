import Link from 'next/link'

import { isWaitlistMode } from '@/lib/waitlist-mode'

/**
 * Slim premium beta announcement for the marketing landing page.
 * Document-flow (not sticky) so it scrolls away and the fixed nav settles to the top.
 * Copy only — waitlist CTA lives in nav / hero / sticky dock to avoid CTA spam.
 */
export function AnnouncementBanner() {
  const waitlist = isWaitlistMode()

  return (
    <div
      id="announcement-banner"
      className="announcement-banner relative z-[55] isolate overflow-hidden border-b border-white/[0.1]"
      role="region"
      aria-label="Product announcement"
    >
      <div
        aria-hidden
        className="announcement-banner-grid pointer-events-none absolute inset-0"
      />

      <div className="announcement-banner-inner relative mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6 sm:py-2.5 lg:px-12">
        <span aria-hidden className="announcement-banner-rule min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <p className="text-balance text-center font-body text-[11px] leading-snug tracking-[0.01em] text-[#A1A1AA] sm:text-[12.5px]">
            {waitlist ? (
              <>
                <span className="text-white/90">Scout is now in private beta</span>
                <span className="text-white/25"> — </span>
                <span>join the waitlist for a seat.</span>
              </>
            ) : (
              <>
                <span className="text-white/90">Now in beta</span>
                <span className="text-white/25"> — </span>
                <span>applications improve every week.</span>
              </>
            )}
          </p>

          {!waitlist ? (
            <Link
              href="/blog"
              className="announcement-banner-cta font-label group hidden shrink-0 items-center gap-1 text-[11px] font-medium tracking-[0.04em] text-[#FF6733] transition-colors duration-200 hover:text-[#ff8254] sm:inline-flex sm:min-h-8"
            >
              Learn more
              <span
                aria-hidden
                className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          ) : null}
        </div>

        <span aria-hidden className="announcement-banner-rule min-w-0 flex-1" />
      </div>
    </div>
  )
}
