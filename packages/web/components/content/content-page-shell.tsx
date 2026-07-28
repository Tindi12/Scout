import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Content page hero — padded past LandingRails (px-6) so copy never
 * sits flush against the grid lines on any viewport.
 */
export function ContentHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className="mx-auto max-w-3xl px-9 text-center sm:px-10 lg:px-16">
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-headline text-[1.75rem] font-medium leading-snug tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl sm:leading-tight md:text-5xl lg:text-6xl">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-[18rem] font-body text-[14px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:max-w-xl sm:text-[16px] md:text-[17px]">
        {description}
      </p>
    </header>
  )
}

/** Soft fade for tab-swapped page bodies (layout chrome stays mounted). */
export function ContentSwap({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('content-swap animate-content-swap pb-16 sm:pb-24', className)}>
      {children}
    </div>
  )
}
