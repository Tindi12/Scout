import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

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
    <header className="mx-auto max-w-3xl px-6 text-center lg:px-12">
      <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
        {eyebrow}
      </p>
      <h1 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl lg:text-6xl">
        {title}
      </h1>
      <p className="mx-auto mt-5 max-w-2xl font-body text-[16px] leading-relaxed text-[#A1A1AA] md:text-[17px]">
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
    <div className={cn('content-swap animate-content-swap pb-24', className)}>
      {children}
    </div>
  )
}
