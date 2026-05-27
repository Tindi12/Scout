'use client'

import Link from 'next/link'

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
      <Link
        href="/explore"
        className="inline-flex h-9 items-center justify-center rounded-full bg-[#FF6733] px-4 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97]"
      >
        Send Scout →
      </Link>
    </div>
  )
}
