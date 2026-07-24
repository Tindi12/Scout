'use client'

import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { EMPLOYERS } from '@/lib/employer-logos'

// Fixed pixel geometry: CSS offset-path coordinates are in the element's own
// px space, so the strip cannot scale responsively without breaking the path.
const WIDTH = 360
const HEIGHT = 72
const MID_Y = HEIGHT / 2
// Destination tile is a fixed-width pill so wordmark logos (Meta, Airbus…)
// fit without the tile jiggling between employers.
const COMPANY_TILE_W = 76
// Flight path between the inner edges of the two logo tiles, arcing upward.
const FLIGHT_PATH = `M 52 ${MID_Y} Q ${(WIDTH - COMPANY_TILE_W + 52) / 2} 4 ${
  WIDTH - COMPANY_TILE_W - 8
} ${MID_Y}`

// One cycle: fade in at Scout, fly ~1.5s, fade out at the company tile.
const FLIGHT_DURATION = 2.1
// Pause on the delivered logo before the crossfade + next launch.
const NEXT_CYCLE_DELAY_MS = 1100

function CompanyLogo({
  index,
  reduceMotion,
}: {
  index: number
  reduceMotion: boolean | null
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const employer = EMPLOYERS[index % EMPLOYERS.length]
  // Apple's glyph reads large; nudge it down so it sits like the others.
  const squareSize = employer.slug === 'apple' ? 30 : 36
  const squareClass = employer.slug === 'apple' ? 'h-[30px] w-[30px]' : 'h-9 w-9'

  const logo = failed[employer.slug] ? (
    <span className="font-label text-xs font-semibold text-white/60">
      {employer.initials}
    </span>
  ) : (
    <Image
      src={employer.logoUrl}
      alt={employer.name}
      width={employer.wide ? 60 : squareSize}
      height={employer.wide ? 14 : squareSize}
      unoptimized
      className={
        employer.wide
          ? 'h-auto max-h-6 w-[60px] object-contain'
          : `${squareClass} object-contain`
      }
      onError={() =>
        setFailed((prev) => ({ ...prev, [employer.slug]: true }))
      }
    />
  )

  if (reduceMotion) {
    return (
      <span
        className="flex h-full w-full items-center justify-center"
        title={employer.name}
      >
        {logo}
      </span>
    )
  }

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={employer.slug}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex h-full w-full items-center justify-center"
        title={employer.name}
      >
        {logo}
      </motion.span>
    </AnimatePresence>
  )
}

/**
 * Looping micro-animation: a paper plane launches from the Scout logo, flies a
 * shallow arc, and lands on a rotating set of employer logos — "Scout applies
 * to companies for you" with no copy. Flat, no glows or gradients.
 */
export function HeroApplyAnimation() {
  const reduceMotion = useReducedMotion()
  const [companyIndex, setCompanyIndex] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [scale, setScale] = useState(1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  useEffect(() => {
    const update = () => {
      const available = Math.max(200, window.innerWidth - 32)
      setScale(Math.min(1, available / WIDTH))
    }
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  const handleFlightComplete = () => {
    setCompanyIndex((i) => (i + 1) % EMPLOYERS.length)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => setCycle((c) => c + 1),
      NEXT_CYCLE_DELAY_MS,
    )
  }

  return (
    <div
      className="mx-auto overflow-hidden"
      style={{ width: WIDTH * scale, height: HEIGHT * scale }}
    >
      <div
        role="img"
        aria-label="Scout automatically sends applications to top engineering companies for you"
        className="relative origin-top-left"
        style={{
          width: WIDTH,
          height: HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {/* Faint dashed route between the two tiles. */}
        <svg
          aria-hidden
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          fill="none"
          className="absolute inset-0"
        >
          <path
            d={FLIGHT_PATH}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        </svg>

        {/* Scout origin tile */}
        <span className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
          <Image
            src="/scout-logo.png"
            alt="Scout"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
        </span>

        {/* Destination company tile */}
        <span
          className="absolute right-0 top-1/2 flex h-10 -translate-y-1/2 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-2"
          style={{ width: COMPANY_TILE_W }}
        >
          <CompanyLogo index={companyIndex} reduceMotion={reduceMotion} />
        </span>

        {reduceMotion ? (
          <ArrowRight
            aria-hidden
            className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white/50"
            strokeWidth={1.75}
          />
        ) : (
          <motion.span
            key={cycle}
            aria-hidden
            className="absolute left-0 top-0 text-primary"
            style={{
              offsetPath: `path("${FLIGHT_PATH}")`,
              offsetRotate: 'auto',
            }}
            initial={{ offsetDistance: '0%', opacity: 0 }}
            animate={{
              offsetDistance: ['0%', '0%', '100%', '100%'],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: FLIGHT_DURATION,
              times: [0, 0.14, 0.9, 1],
              ease: ['linear', 'easeInOut', 'linear'],
            }}
            onAnimationComplete={handleFlightComplete}
          >
            <Send className="h-4 w-4 rotate-45" strokeWidth={1.75} />
          </motion.span>
        )}
      </div>
    </div>
  )
}
