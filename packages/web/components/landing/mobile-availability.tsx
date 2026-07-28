/**
 * Mobile-only availability note. Scout launches desktop-first; this frames
 * that as an intentional product decision rather than a missing feature.
 *
 * Horizontal padding matches SectionFrame / LandingRails (px-6) so copy sits
 * inside the designed grid lines on phones.
 */
export function MobileAvailability() {
  return (
    <section
      aria-labelledby="mobile-availability-heading"
      className="relative px-6 py-14 sm:hidden"
    >
      <div className="mx-auto max-w-sm text-center">
        <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733]">
          Desktop first
        </p>
        <h2
          id="mobile-availability-heading"
          className="mt-3 font-headline text-[1.5rem] font-medium leading-snug tracking-[-0.03em] text-white"
        >
          Crafted for the desktop experience.
        </h2>
        <p className="mt-4 font-body text-[14px] leading-relaxed text-[#A1A1AA]">
          Scout launches on desktop first. Use a computer or laptop for the
          best experience. Mobile support is coming soon.
        </p>
      </div>
    </section>
  )
}
