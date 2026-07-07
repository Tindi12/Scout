'use client'

import { CheckCircle2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ProfileSectionProps {
  title: string
  icon: LucideIcon
  description: string
  complete: boolean
  children: ReactNode
}

export function ProfileSection({
  title,
  icon: Icon,
  description,
  complete,
  children,
}: ProfileSectionProps) {
  return (
    <section className="glass-card rounded-2xl border border-white/[0.06] p-6 md:p-7">
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            complete
              ? 'border-[#22c55e]/30 bg-[#22c55e]/10'
              : 'border-[#FF6733]/25 bg-primary/[0.06]',
          )}
        >
          <Icon className="h-[18px] w-[18px] text-[#FF6733]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-headline text-base font-medium tracking-tight text-white">
              {title}
            </h3>
            {complete ? (
              <CheckCircle2
                className="h-4 w-4 text-[#22c55e]"
                strokeWidth={2}
                aria-label="Section complete"
              />
            ) : (
              <span
                aria-label="Section incomplete"
                className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-[#666]">{description}</p>
        </div>
      </header>
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  )
}
