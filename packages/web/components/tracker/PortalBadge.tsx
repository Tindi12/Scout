'use client'

import { cn } from '@/lib/utils'

import type { PortalType } from './tracker-utils'

const PORTAL_STYLES: Record<
  Exclude<PortalType, 'unknown'>,
  { abbr: string; classes: string }
> = {
  greenhouse: {
    abbr: 'GH',
    classes: 'bg-[#22c55e]/10 text-[#22c55e]',
  },
  lever: {
    abbr: 'LV',
    classes: 'bg-[#3b82f6]/10 text-[#3b82f6]',
  },
  ashby: {
    abbr: 'AS',
    classes: 'bg-purple-500/10 text-purple-400',
  },
  workday: {
    abbr: 'WD',
    classes: 'bg-white/[0.06] text-[#888]',
  },
}

type PortalBadgeProps = {
  portal: PortalType
  className?: string
}

export function PortalBadge({ portal, className }: PortalBadgeProps) {
  if (portal === 'unknown') return null
  const meta = PORTAL_STYLES[portal]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide',
        meta.classes,
        className,
      )}
    >
      {meta.abbr}
    </span>
  )
}
