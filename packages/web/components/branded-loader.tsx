'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { Send } from 'lucide-react'

import { scoutLogo } from '@/lib/scout-logo'

// Same visual language as the landing hero's apply animation (a paper plane
// tracing a shallow dashed arc), reused here so the auth → app transition reads
// as one branded moment instead of a bare white screen. Fixed px geometry: the
// CSS offset-path coordinates live in the element's own px space.
const W = 220
const H = 64
const MID_Y = H / 2
const FLIGHT_PATH = `M 12 ${MID_Y} Q ${W / 2} 6 ${W - 12} ${MID_Y}`

function FlightStrip() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative" style={{ width: W, height: H }}>
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        fill="none"
        className="absolute inset-0"
      >
        <path
          d={FLIGHT_PATH}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
          strokeDasharray="3 5"
          strokeLinecap="round"
        />
      </svg>

      {reduceMotion ? (
        // Static, pulsing plane — no travel — for reduced-motion users.
        <motion.span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Send className="h-4 w-4 rotate-45" strokeWidth={1.75} />
        </motion.span>
      ) : (
        <motion.span
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
            duration: 1.8,
            times: [0, 0.12, 0.88, 1],
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 0.25,
          }}
        >
          {/* Lucide Send points NE; +45° aligns it with the path tangent. */}
          <Send className="h-4 w-4 rotate-45" strokeWidth={1.75} />
        </motion.span>
      )}
    </div>
  )
}

/**
 * Full-screen branded loading state for the auth → app handoff. Renders the dark
 * brand background, the Scout wordmark, and the looping paper-plane strip so the
 * window while Clerk resolves the session (and we decide onboarding vs dashboard)
 * is filled with something branded instead of a blank white screen.
 *
 * Used as route-level `loading.tsx` fallbacks and as an in-page overlay during
 * the OAuth `sso-callback` return. Pass `inline` to drop the fixed positioning
 * and wordmark (e.g. inside the Clerk card while its JS boots).
 */
export function BrandedLoader({
  label = 'One moment',
  inline = false,
  fill = false,
}: {
  label?: string
  // Compact, no wordmark — sits inside an existing card (e.g. the Clerk box).
  inline?: boolean
  // Fills its parent container instead of the viewport — for in-page section /
  // Suspense loads where the app shell (sidebar, header) is already painted.
  fill?: boolean
}) {
  if (inline) {
    return (
      <div className="flex h-56 w-full flex-col items-center justify-center gap-4">
        <FlightStrip />
        <p className="font-body text-sm text-[#71717A]">{label}…</p>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${label}…`}
      className={
        fill
          ? 'flex min-h-[70vh] w-full flex-col items-center justify-center gap-8'
          : 'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-[#080808]'
      }
    >
      <div className="flex items-center gap-2.5">
        <Image
          src={scoutLogo}
          alt="Scout"
          width={32}
          height={32}
          priority
          draggable={false}
          className="h-8 w-8 select-none object-contain"
        />
        <span className="font-headline text-xl font-semibold tracking-tight text-white">
          Scout
        </span>
      </div>

      <FlightStrip />

      <p className="font-body text-sm text-[#71717A]">{label}…</p>
    </div>
  )
}
