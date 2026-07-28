'use client'

import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Send } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import { EMPLOYERS } from '@/lib/employer-logos'

const MAX_WIDTH = 360
/** Destination pill width as a fraction of the strip (76/360). */
const COMPANY_TILE_FR = 76 / 360
/** Gap past Scout tile before the path begins. */
const START_CLEARANCE = 10
/**
 * Plane-center → company-tile gap. Desktop stays tight (original feel);
 * mobile keeps a bit more so the tip never enters the pill.
 */
function endClearanceForWidth(width: number) {
  return width >= 340 ? 10 : 16
}

const FLIGHT_DURATION = 2.1
const NEXT_CYCLE_DELAY_MS = 1100

const FALLBACK_PATH = `M 50 36 Q 180 4 274 36`

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

  const logo = failed[employer.slug] ? (
    <span className="font-label text-xs font-semibold text-white/60">
      {employer.initials}
    </span>
  ) : employer.wide ? (
    <Image
      src={employer.logoUrl}
      alt={employer.name}
      width={120}
      height={28}
      unoptimized
      className="h-auto max-h-6 w-[60px] object-contain"
      style={{ width: 60, height: 'auto' }}
      onError={() =>
        setFailed((prev) => ({ ...prev, [employer.slug]: true }))
      }
    />
  ) : (
    <Image
      src={employer.logoUrl}
      alt={employer.name}
      width={squareSize}
      height={squareSize}
      unoptimized
      className="object-contain"
      style={{ height: squareSize, width: 'auto', maxWidth: squareSize }}
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
 *
 * Path is measured from the live tile boxes (no CSS scale), so the plane and
 * dotted route always stop short of the company pill on every viewport width.
 */
export function HeroApplyAnimation() {
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const scoutRef = useRef<HTMLSpanElement>(null)
  const companyRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [companyIndex, setCompanyIndex] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [path, setPath] = useState(FALLBACK_PATH)
  const [size, setSize] = useState({ w: MAX_WIDTH, h: 72 })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const measure = () => {
      const scout = scoutRef.current
      const company = companyRef.current
      if (!scout || !company) return

      const w = root.clientWidth
      const h = root.clientHeight
      const startX = scout.offsetLeft + scout.offsetWidth + START_CLEARANCE
      const endX = company.offsetLeft - endClearanceForWidth(w)
      if (endX <= startX + 8) return

      const midY = h / 2
      const ctrlY = Math.max(4, h * 0.06)
      setSize({ w, h })
      setPath(
        `M ${startX.toFixed(1)} ${midY.toFixed(1)} Q ${((startX + endX) / 2).toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${midY.toFixed(1)}`,
      )
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => {
      ro.disconnect()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
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
      ref={rootRef}
      className="relative mx-auto h-14 w-full max-w-[360px] sm:h-[72px]"
    >
      <div
        role="img"
        aria-label="Scout automatically sends applications to top engineering companies for you"
        className="absolute inset-0"
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          fill="none"
          className="pointer-events-none absolute inset-0"
        >
          <path
            d={path}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        </svg>

        <span
          ref={scoutRef}
          className="absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] sm:h-10 sm:w-10"
        >
          <Image
            src="/scout-logo.png"
            alt="Scout"
            width={32}
            height={32}
            className="object-contain"
            style={{ width: 'auto', height: 'auto', maxHeight: 32, maxWidth: 32 }}
          />
        </span>

        <span
          ref={companyRef}
          className="absolute right-0 top-1/2 flex h-9 -translate-y-1/2 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-2 sm:h-10"
          style={{ width: `${COMPANY_TILE_FR * 100}%` }}
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
              offsetPath: `path("${path}")`,
              offsetRotate: 'auto',
            }}
            initial={{ offsetDistance: '0%', opacity: 0 }}
            animate={{
              offsetDistance: ['0%', '0%', '100%', '100%'],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: FLIGHT_DURATION,
              times: [0, 0.14, 0.88, 1],
              ease: ['linear', 'easeInOut', 'linear'],
            }}
            onAnimationComplete={handleFlightComplete}
          >
            <Send className="h-3.5 w-3.5 rotate-45 sm:h-4 sm:w-4" strokeWidth={1.75} />
          </motion.span>
        )}
      </div>
    </div>
  )
}
