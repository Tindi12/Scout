import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Content page hero — same gutters as /pricing so copy aligns to the rails.
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
    <header className="mx-auto max-w-3xl text-center">
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-headline text-[1.75rem] font-medium leading-snug tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl sm:leading-tight md:text-5xl lg:text-6xl">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-xl font-body text-[14px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-[16px] md:text-[17px]">
        {description}
      </p>
    </header>
  )
}

/** Soft fade for tab-swapped page bodies (layout chrome stays mounted). */
export function ContentSwap({
  children,
  className,
  ...props
}: {
  children: ReactNode
  className?: string
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('content-swap animate-content-swap', className)} {...props}>
      {children}
    </div>
  )
}
