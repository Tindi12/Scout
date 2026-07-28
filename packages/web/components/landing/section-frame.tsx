import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Continuous vertical guide rails down the centered content column. Rendered
 * once inside the landing <main> as a page-level decorative overlay.
 * Includes a secondary outer pair for the double-frame effect.
 */
export function LandingRails() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 right-0 -z-10 px-6 lg:px-12"
    >
      <div className="landing-rails relative mx-auto min-h-full max-w-7xl">
        <div className="landing-rails-outer" />
      </div>
    </div>
  )
}

/**
 * Wraps a landing section with a hairline divider at its top edge and small
 * "+" marks where the divider meets each vertical rail (primary + outer).
 */
export function SectionFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 px-6 lg:px-12"
      >
        <div className="frame-divider relative mx-auto max-w-7xl">
          <span className="frame-corner" style={{ left: 0 }} />
          <span className="frame-corner" style={{ left: '100%' }} />
          <span
            className="frame-corner frame-corner-outer"
            style={{ left: 'calc(-1 * var(--landing-frame-gap))' }}
          />
          <span
            className="frame-corner frame-corner-outer"
            style={{ left: 'calc(100% + var(--landing-frame-gap))' }}
          />
        </div>
      </div>
      {children}
    </div>
  )
}
