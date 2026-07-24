'use client'

import { animate, useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type FlipNumberProps = {
  /** Launch seed — where the counter begins (never zero). */
  seed: number
  /** Live paced target from the database. */
  target: number
  /** Optional unit/suffix after the digits (e.g. "+"). */
  unit?: string
  ariaLabel: string
  size?: 'md' | 'sm'
  className?: string
  /** When provided, drives the flip instead of each board's own in-view observer. */
  active?: boolean
}

/** Meaningful tick size so large totals don't crawl one-by-one. */
function tickSize(delta: number): number {
  if (delta <= 0) return 1
  const idealTicks = delta <= 40 ? 4 : delta <= 200 ? 5 : 6
  const raw = Math.max(1, Math.ceil(delta / idealTicks))
  const nice = [1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500]
  return nice.find((n) => n >= raw) ?? raw
}

function durationFor(delta: number): number {
  if (delta <= 20) return 0.22
  if (delta <= 80) return 0.3
  if (delta <= 250) return 0.38
  return 0.48
}

function formatValue(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US')
}

function RollingDigit({ char, size }: { char: string; size: 'md' | 'sm' }) {
  const isDigit = char >= '0' && char <= '9'

  const cell = size === 'sm' ? 'h-6 w-[1.15rem] sm:h-7 sm:w-5' : 'h-9 w-6 sm:h-10 sm:w-7'
  const glyph =
    size === 'sm' ? 'text-xs sm:text-sm' : 'text-lg sm:text-xl'
  const punct =
    size === 'sm'
      ? 'h-6 w-2.5 text-xs sm:h-7 sm:w-3 sm:text-sm'
      : 'h-9 w-3.5 text-lg sm:h-10 sm:w-4 sm:text-xl'

  if (!isDigit) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center font-mono font-medium text-white/35',
          punct,
        )}
      >
        {char}
      </span>
    )
  }

  const n = Number(char)

  return (
    <span
      aria-hidden
      className={cn(
        'relative shrink-0 overflow-hidden rounded-[5px] border border-white/[0.08] bg-[#141414] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
        cell,
      )}
    >
      <span
        className="flip-digit-strip absolute inset-x-0 top-0 flex flex-col"
        style={{ transform: `translateY(-${n * 10}%)` }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'flex items-center justify-center font-mono font-medium tabular-nums text-white',
              cell,
              glyph,
            )}
          >
            {i}
          </span>
        ))}
      </span>
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-px bg-black/55" />
    </span>
  )
}

/**
 * Live odometer: starts at a launch seed, ticks toward the DB-backed target,
 * then keeps slowly dripping upward so the metric always feels alive.
 */
export function FlipNumber({
  seed,
  target,
  unit,
  ariaLabel,
  size = 'md',
  className,
  active: activeProp,
}: FlipNumberProps) {
  const ref = useRef<HTMLDivElement>(null)
  const localInView = useInView(ref, { once: true, amount: 0.35 })
  const active = activeProp ?? localInView
  const reduceMotion = useReducedMotion()

  const seedSafe = Math.max(0, Math.round(seed))
  const targetSafe = Math.max(seedSafe, Math.round(target))

  const [displayed, setDisplayed] = useState(seedSafe)
  const displayedRef = useRef(seedSafe)
  const targetRef = useRef(targetSafe)
  const catchingUpRef = useRef(false)

  targetRef.current = targetSafe

  // Catch up whenever the live target moves ahead of the display.
  useEffect(() => {
    if (!active) return

    // Reduced motion: snap to target, no animated roll.
    if (reduceMotion) {
      displayedRef.current = targetSafe
      setDisplayed(targetSafe)
      return
    }

    const from = displayedRef.current
    const to = targetSafe
    if (to <= from) return

    catchingUpRef.current = true
    const step = tickSize(to - from)
    let lastShown = from

    const controls = animate(from, to, {
      duration: durationFor(to - from),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        const remaining = to - latest
        const snapped =
          remaining <= step
            ? Math.round(latest)
            : Math.floor(latest / step) * step
        const next = Math.min(to, Math.max(from, snapped))
        if (next !== lastShown) {
          lastShown = next
          displayedRef.current = next
          setDisplayed(next)
        }
      },
      onComplete: () => {
        displayedRef.current = to
        setDisplayed(to)
        catchingUpRef.current = false
      },
    })

    return () => {
      controls.stop()
      catchingUpRef.current = false
    }
  }, [active, targetSafe, reduceMotion])

  // Keep ticking forever (prop growth). When the DB later surpasses the
  // display, the catch-up effect above snaps forward to the real total.
  useEffect(() => {
    if (!active || reduceMotion) return

    let timeoutId = 0
    let cancelled = false

    const schedule = () => {
      // Slight jitter so the three cards don't lock-step.
      const delay = 1100 + Math.floor(Math.random() * 900)
      timeoutId = window.setTimeout(() => {
        if (cancelled) return
        if (!catchingUpRef.current) {
          const truth = targetRef.current
          const cur = displayedRef.current
          // Only drip when at/above the live target; catch-up owns the climb.
          if (cur >= truth) {
            const next = cur + 1
            displayedRef.current = next
            setDisplayed(next)
          }
        }
        schedule()
      }, delay)
    }

    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [active, reduceMotion])

  const chars = formatValue(displayed).split('')

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      className={cn(
        'flex items-center justify-center gap-0.5 sm:gap-[3px]',
        className,
      )}
    >
      {chars.map((char, i) => (
        <RollingDigit key={i} char={char} size={size} />
      ))}
      {unit ? (
        <span
          className={cn(
            'ml-1 font-label font-medium tracking-[0.08em] text-white/55',
            size === 'sm' ? 'text-sm' : 'text-lg sm:text-xl',
          )}
        >
          {unit}
        </span>
      ) : null}
    </div>
  )
}
