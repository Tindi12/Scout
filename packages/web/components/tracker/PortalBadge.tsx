'use client'

import { cn } from '@/lib/utils'

import { PORTAL_META, type PortalType } from './tracker-utils'

type PortalBadgeProps = {
  portal: PortalType
  className?: string
}

export function PortalBadge({ portal, className }: PortalBadgeProps) {
  if (portal === 'unknown') return null
  const meta = PORTAL_META[portal]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-2 py-0.5 font-label text-[10px] font-medium',
        meta.classes,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
