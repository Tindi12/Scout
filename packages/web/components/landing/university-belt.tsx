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
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-3.5">
      {uni.logoUrl ? (
        // Fixed layout slot so scale never shifts spacing / neighbors.
        <div className="flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
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
              className="h-11 w-11 select-none object-contain sm:h-12 sm:w-12"
            />
          </div>
        </div>
      ) : null}
      <span className="max-w-[11rem] text-center font-label text-[13px] font-medium leading-snug tracking-wide text-white/85 sm:max-w-[13rem] sm:text-left sm:text-sm">
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
    <section ref={sectionRef} className="relative px-6 py-16 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <p className="text-center font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#888888]">
          used by students at
        </p>

        <ul className="mt-10 flex list-none flex-wrap items-center justify-center gap-x-10 gap-y-10 sm:gap-x-14 md:gap-x-16 lg:gap-x-20">
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
