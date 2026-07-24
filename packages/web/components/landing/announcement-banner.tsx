import Link from 'next/link'

import { ComingSoonCta } from '@/components/landing/waitlist'
import { isWaitlistMode } from '@/lib/waitlist-mode'

/**
 * Slim premium beta announcement for the marketing landing page.
 * Document-flow (not sticky) so it scrolls away and the fixed nav settles to the top.
 * Mobile: copy only — waitlist CTA lives in hero / sticky dock to avoid CTA spam.
 */
export function AnnouncementBanner() {
  const waitlist = isWaitlistMode()

  return (
    <div
      id="announcement-banner"
      className="announcement-banner relative z-[55] isolate overflow-hidden border-b border-white/[0.06]"
      role="region"
      aria-label="Product announcement"
    >
      <div
        aria-hidden
        className="announcement-banner-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="announcement-banner-lines pointer-events-none absolute inset-0"
      />

      <div className="announcement-banner-inner relative mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-1.5 sm:gap-4 sm:px-6 sm:py-2 lg:px-12">
        <p className="text-balance text-center font-body text-[11px] leading-snug tracking-[0.01em] text-[#A1A1AA] sm:flex-1 sm:text-[12.5px]">
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
        ) : (
          <ComingSoonCta
            source="banner"
            label="Join waitlist"
            size="sm"
            className="hidden h-8 min-h-0 shrink-0 px-3 text-[12px] sm:inline-flex"
          />
        )}
      </div>
    </div>
  )
}
