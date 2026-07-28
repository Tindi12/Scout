'use client'

import { useInView } from 'framer-motion'
import { useRef } from 'react'

import { getUniversityLogos, type University } from '@/lib/ncaa-logos'
import { cn } from '@/lib/utils'

/** Wave stagger between adjacent logos (seconds). */
const BREATHE_STAGGER_S = 0.65

function UniversityItem({
  uni,
  active,
  breatheDelay,
}: {
  uni: University
  active: boolean
  breatheDelay: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-3.5">
      {uni.logoUrl ? (
        // Fixed layout slot so scale never shifts spacing / neighbors.
        <div className="flex h-8 w-8 shrink-0 items-center justify-center sm:h-12 sm:w-12">
          <div
            className={cn('logo-breathe', active && 'is-breathing')}
            style={{ animationDelay: breatheDelay }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uni.logoUrl}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-8 w-8 select-none object-contain sm:h-12 sm:w-12"
            />
          </div>
        </div>
      ) : null}
      <span className="max-w-[9rem] text-center font-label text-[11px] font-medium leading-snug tracking-wide text-white/85 sm:max-w-[13rem] sm:text-left sm:text-sm">
        {uni.name}
      </span>
    </div>
  )
}

/**
 * Static, balanced university social-proof row.
 * Logos are driven from getUniversityLogos(); breathing starts only once
 * the section enters the viewport, then continues in a staggered wave.
 */
export function UniversityBelt() {
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, {
    amount: 0.35,
    margin: '0px 0px -8% 0px',
  })
  const universities = getUniversityLogos()

  return (
    <section ref={sectionRef} className="relative px-4 py-8 sm:px-6 sm:py-14 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-5xl">
        <p className="text-center font-label text-[10px] font-medium uppercase tracking-[0.18em] text-[#888888] sm:text-[12px] sm:tracking-[0.2em]">
          With interest from students at:
        </p>

        <ul className="mt-5 grid list-none grid-cols-2 items-start justify-items-center gap-x-4 gap-y-5 sm:mt-10 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-14 sm:gap-y-10 md:gap-x-16 lg:gap-x-20">
          {universities.map((uni, i) => (
            <li key={uni.slug ?? uni.name}>
              <UniversityItem
                uni={uni}
                active={inView}
                breatheDelay={`${i * BREATHE_STAGGER_S}s`}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
