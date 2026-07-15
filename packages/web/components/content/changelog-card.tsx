import Image from 'next/image'
import type { ReactNode } from 'react'

import { formatContentDate, type ChangelogMeta, type ContentEntry } from '@/lib/content'
import { scoutLogo } from '@/lib/scout-logo'

type ChangelogCardProps = {
  entry: ContentEntry<ChangelogMeta>
  children: ReactNode
}

export function ChangelogCard({ entry, children }: ChangelogCardProps) {
  return (
    <article
      id={entry.slug}
      className="glass-card scroll-mt-32 overflow-hidden rounded-2xl"
    >
      <div className="border-b border-white/5 px-6 py-5 md:px-8 md:py-6">
        <div className="flex flex-wrap items-start gap-3">
          <Image
            src={scoutLogo}
            alt=""
            width={28}
            height={28}
            className="mt-0.5 h-7 w-7 object-contain opacity-90"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-headline text-xl font-medium tracking-tight text-white md:text-2xl">
              {entry.title}
            </h2>
            <p className="mt-1 font-label text-[11px] uppercase tracking-[0.18em] text-[#888888]">
              Version {entry.version}
              <span className="mx-2 text-white/20">·</span>
              {formatContentDate(entry.date)}
            </p>
          </div>
          <span className="font-label rounded-md border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D4D4D8]">
            v{entry.version}
          </span>
        </div>
        <p className="mt-4 max-w-3xl font-body text-[15px] leading-relaxed text-[#A1A1AA]">
          {entry.description}
        </p>
      </div>
      <div className="px-6 py-6 md:px-8 md:py-8">{children}</div>
    </article>
  )
}
