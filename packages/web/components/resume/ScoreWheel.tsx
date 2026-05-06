'use client'

import { motion } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'

interface ScoreWheelProps {
  score: number
  size?: number
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function scoreColor(value: number): string {
  if (value >= 90) return '#22c55e'
  if (value >= 71) return '#FF6733'
  if (value >= 41) return '#f59e0b'
  return '#ef4444'
}

function scoreLabel(value: number): string {
  if (value >= 90) return 'Excellent'
  if (value >= 71) return 'Strong'
  if (value >= 41) return 'Getting There'
  return 'Needs Work'
}

const ANIMATION_DURATION_MS = 1500

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function ScoreWheel({ score, size = 240 }: ScoreWheelProps) {
  const finalScore = clampScore(score)
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number | null>(null)
  const gradientId = useId()

  useEffect(() => {
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / ANIMATION_DURATION_MS)
      const eased = easeOutCubic(t)
      setDisplayed(finalScore * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [finalScore])

  const strokeWidth = 12
  const radius = size / 2 - strokeWidth / 2 - 2
  const circumference = 2 * Math.PI * radius
  const middleRadius = radius - strokeWidth - 6
  const innerRadius = middleRadius - 10

  const color = scoreColor(finalScore)
  const label = scoreLabel(finalScore)
  const dashOffset = circumference * (1 - displayed / 100)
  const cx = size / 2
  const cy = size / 2

  const numberFontSize = Math.max(36, Math.round(size * 0.26))
  const subFontSize = Math.max(12, Math.round(size * 0.075))

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 0 40px ${color}4D) drop-shadow(0 0 16px ${color}88)`,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.0" />
            <stop offset="50%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />

        <circle
          cx={cx}
          cy={cy}
          r={middleRadius}
          fill="none"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth={1}
        />

        <motion.g
          style={{ originX: '50%', originY: '50%', opacity: 0.15 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={innerRadius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
        </motion.g>

        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke 250ms ease-out',
            }}
          />
        </g>
      </svg>

      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        role="img"
        aria-label={`Score ${Math.round(finalScore)} of 100, ${label}`}
      >
        <span
          className="font-headline font-extrabold leading-none tabular-nums text-white"
          style={{ fontSize: numberFontSize }}
        >
          {Math.round(displayed)}
        </span>
        <span
          className="mt-1 font-body leading-none text-[#555]"
          style={{ fontSize: subFontSize }}
        >
          / 100
        </span>
        <span
          className="mt-3 font-label text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
