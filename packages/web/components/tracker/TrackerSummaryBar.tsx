'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'

type TrackerSummaryBarProps = {
  appliedCount: number
}

export function TrackerSummaryBar({ appliedCount }: TrackerSummaryBarProps) {
  return (
    <div className="-mx-5 flex items-center justify-between border-b border-white/[0.04] bg-[#0a0a0a] px-8 py-3 md:-mx-8">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" />
        <p className="font-mono text-sm text-[#888]">
          <span className="text-white">{appliedCount}</span>{' '}
          application{appliedCount === 1 ? '' : 's'} submitted
        </p>
      </div>
      <Button asChild size="sm">
        <Link href="/explore">Send Scout →</Link>
      </Button>
    </div>
  )
}
