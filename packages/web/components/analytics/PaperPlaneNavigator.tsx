'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PanelId } from './HoloPanel'

export type Waypoint = {
  x: number
  y: number
  panelId: PanelId | 'home'
}

type PaperPlaneNavigatorProps = {
  waypoints: Waypoint[]
  sceneWidth: number
  sceneHeight: number
  enabled?: boolean
}

const SEGMENT_DURATION = 1.4
const DOCK_PAUSE_MS = 400

function buildPath(from: Waypoint, to: Waypoint): string {
  const midX = (from.x + to.x) / 2
  const midY = Math.min(from.y, to.y) - 40
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`
}

export function PaperPlaneNavigator({
  waypoints,
  sceneWidth,
  sceneHeight,
  enabled = true,
}: PaperPlaneNavigatorProps) {
  const reduceMotion = useReducedMotion()
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [cycle, setCycle] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const segmentCount = Math.max(waypoints.length - 1, 1)
  const from = waypoints[segmentIndex % segmentCount]!
  const to = waypoints[(segmentIndex % segmentCount) + 1]!
  const path = buildPath(from, to)

  const handleComplete = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setSegmentIndex((i) => (i + 1) % segmentCount)
      setCycle((c) => c + 1)
    }, DOCK_PAUSE_MS)
  }, [segmentCount])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  if (!enabled || reduceMotion || waypoints.length < 2) {
    const home = waypoints.find((w) => w.panelId === 'home') ?? waypoints[0]
    return (
      <div
        className="pointer-events-none absolute z-30"
        style={{ left: home.x - 8, top: home.y - 8 }}
        aria-hidden
      >
        <Send className="h-4 w-4 rotate-45 text-primary" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      style={{ width: sceneWidth, height: sceneHeight }}
      aria-hidden
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
        fill="none"
      >
        <path
          d={path}
          stroke="rgba(255,103,51,0.15)"
          strokeWidth="1"
          strokeDasharray="3 5"
          strokeLinecap="round"
        />
      </svg>

      {/* Trail */}
      <motion.span
        key={`trail-${cycle}`}
        className="absolute text-primary/30 blur-[2px]"
        style={{
          offsetPath: `path("${path}")`,
          offsetRotate: 'auto',
        }}
        initial={{ offsetDistance: '0%', opacity: 0 }}
        animate={{
          offsetDistance: ['0%', '85%'],
          opacity: [0, 0.6, 0],
        }}
        transition={{
          duration: SEGMENT_DURATION,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
        }}
      >
        <Send className="h-3 w-3 rotate-45" strokeWidth={1.75} />
      </motion.span>

      {/* Plane */}
      <motion.span
        key={`plane-${cycle}`}
        className="absolute text-primary drop-shadow-[0_0_6px_rgba(255,103,51,0.5)]"
        style={{
          offsetPath: `path("${path}")`,
          offsetRotate: 'auto',
        }}
        initial={{ offsetDistance: '0%', opacity: 0 }}
        animate={{
          offsetDistance: ['0%', '5%', '95%', '100%'],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: SEGMENT_DURATION,
          times: [0, 0.08, 0.92, 1],
          ease: 'easeInOut',
        }}
        onAnimationComplete={handleComplete}
      >
        <Send className="h-4 w-4 rotate-45" strokeWidth={1.75} />
      </motion.span>
    </div>
  )
}
