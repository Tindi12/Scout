'use client'

import { useEffect, useRef, useState } from 'react'

interface ScoreGaugeProps {
  score: number
  size?: number
  /** compact renders ticks + number only, for the refactor sidebar */
  variant?: 'full' | 'compact'
}

const START_ANGLE = 135
const SWEEP = 270
const SEGMENTS = 44
const ANIMATION_DURATION_MS = 1400

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function scoreColor(value: number): string {
  if (value >= 90) return '#22c55e'
  if (value >= 71) return '#FF6733'
  if (value >= 41) return '#f59e0b'
  return '#ef4444'
}

export function scoreLabel(value: number): string {
  if (value >= 90) return 'Excellent'
  if (value >= 71) return 'Strong'
  if (value >= 41) return 'Getting There'
  return 'Needs Work'
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/**
 * Segmented precision gauge: a ring of radial tick segments that fill with
 * the score, a dashed guide ring, and a numeric core. Deliberately flat and
 * mechanical — no glow, no gradient.
 */
export function ScoreGauge({ score, size = 260, variant = 'full' }: ScoreGaugeProps) {
  const finalScore = clampScore(score)
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATION_DURATION_MS)
      setDisplayed(finalScore * easeOutCubic(t))
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [finalScore])

  const compact = variant === 'compact'
  const cx = size / 2
  const cy = size / 2
  const tickOuter = size / 2 - 2
  const tickLen = compact ? size * 0.09 : size * 0.075
  const tickInner = tickOuter - tickLen
  const dashRadius = tickInner - (compact ? 4 : 10)

  const color = scoreColor(finalScore)
  const label = scoreLabel(finalScore)
  const litSegments = Math.round((displayed / 100) * SEGMENTS)

  const ticks = Array.from({ length: SEGMENTS }, (_, i) => {
    const angle = START_ANGLE + (SWEEP / (SEGMENTS - 1)) * i
    const from = polar(cx, cy, tickInner, angle)
    const to = polar(cx, cy, tickOuter, angle)
    return { from, to, lit: i < litSegments }
  })

  const zero = polar(cx, cy, tickInner - (compact ? 0 : 4), START_ANGLE - 14)
  const hundred = polar(cx, cy, tickInner - (compact ? 0 : 4), START_ANGLE + SWEEP + 14)

  const numberFontSize = compact
    ? Math.round(size * 0.34)
    : Math.max(36, Math.round(size * 0.24))

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="overflow-visible"
      >
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.from.x}
            y1={t.from.y}
            x2={t.to.x}
            y2={t.to.y}
            stroke={t.lit ? color : 'rgba(255,255,255,0.09)'}
            strokeWidth={compact ? 2 : 3}
            strokeLinecap="round"
            style={{ transition: 'stroke 150ms linear' }}
          />
        ))}

        {/* dashed guide ring */}
        <circle
          cx={cx}
          cy={cy}
          r={dashRadius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          strokeDasharray="1 5"
        />

        {!compact ? (
          <>
            <text
              x={zero.x}
              y={zero.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#555"
              fontSize={10}
              fontFamily="ui-monospace, monospace"
            >
              0
            </text>
            <text
              x={hundred.x}
              y={hundred.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#555"
              fontSize={10}
              fontFamily="ui-monospace, monospace"
            >
              100
            </text>
          </>
        ) : null}
      </svg>

      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        role="img"
        aria-label={`Resume score ${Math.round(finalScore)} of 100, ${label}`}
      >
        {!compact ? (
          <span className="font-label text-[9px] font-semibold uppercase tracking-[0.3em] text-[#555]">
            Scout Analysis
          </span>
        ) : null}
        <span
          className="font-headline font-extrabold leading-none tabular-nums text-white"
          style={{ fontSize: numberFontSize, marginTop: compact ? 0 : 6 }}
        >
          {Math.round(displayed)}
        </span>
        {!compact ? (
          <>
            <span className="mt-1 font-body text-xs leading-none text-[#555]">
              / 100
            </span>
            <span
              className="mt-2.5 font-label text-[10px] font-semibold uppercase tracking-[0.24em]"
              style={{ color }}
            >
              {label}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}
