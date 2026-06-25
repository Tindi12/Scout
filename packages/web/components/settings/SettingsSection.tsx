'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface SettingsSectionProps {
  title: string
  icon: LucideIcon
  description?: string
  badge?: 'coming-soon'
  children: ReactNode
}

export function SettingsSection({
  title,
  icon: Icon,
  description,
  badge,
  children,
}: SettingsSectionProps) {
  return (
    <section className="glass-card rounded-2xl border border-white/[0.06] p-6 md:p-7">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF6733]/25 bg-[#FF6733]/[0.06]">
          <Icon className="h-[18px] w-[18px] text-[#FF6733]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-headline text-base font-medium tracking-tight text-white">
              {title}
            </h2>
            {badge === 'coming-soon' ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#666]">
                Coming soon
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-xs text-[#666]">{description}</p>
          ) : null}
        </div>
      </header>
      <div className={cn('mt-6 space-y-4')}>{children}</div>
    </section>
  )
}

export function SettingsReadOnlyRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <span className="text-sm text-[#888]">{label}</span>
      <span className="text-sm text-white">{value || '—'}</span>
    </div>
  )
}
