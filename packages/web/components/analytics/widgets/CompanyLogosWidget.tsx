'use client'

import Image from 'next/image'
import { useState } from 'react'

import { ANALYTICS_EMPLOYERS } from '@/lib/analytics-employers'

export function CompanyLogosWidget() {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const logos = ANALYTICS_EMPLOYERS.slice(0, 4)

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#555]">
        Companies
      </span>
      <div className="grid grid-cols-2 gap-2 opacity-40">
        {logos.map((employer) => (
          <div
            key={employer.slug}
            className="flex h-8 items-center justify-center rounded-md border border-white/[0.04] bg-white/[0.02] px-2"
          >
            {failed[employer.slug] ? (
              <span className="font-label text-[10px] font-semibold text-white/40">
                {employer.initials}
              </span>
            ) : (
              <Image
                src={employer.logoUrl}
                alt=""
                width={employer.wide ? 48 : 20}
                height={employer.wide ? 12 : 20}
                unoptimized
                className={
                  employer.wide
                    ? 'h-auto max-h-3 w-12 object-contain opacity-60'
                    : 'h-5 w-5 object-contain opacity-60'
                }
                onError={() =>
                  setFailed((prev) => ({ ...prev, [employer.slug]: true }))
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
