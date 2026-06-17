import type { ReactNode } from 'react'

/**
 * Continuous vertical guide rails down the centered content column. Rendered
 * once inside the landing <main> as a page-level decorative overlay.
 */
export function LandingRails() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 px-6 lg:px-12"
    >
      <div className="landing-rails mx-auto h-full max-w-7xl" />
    </div>
  )
}

/**
 * Wraps a landing section with a hairline divider at its top edge and a small
 * "+" mark where the divider meets each vertical rail.
 */
export function SectionFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 px-6 lg:px-12"
      >
        <div className="frame-divider relative mx-auto max-w-7xl">
          <span className="frame-corner" style={{ left: 0 }} />
          <span className="frame-corner" style={{ left: '100%' }} />
        </div>
      </div>
      {children}
    </div>
  )
}
