'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type PanelId =
  | 'timeline'
  | 'pipeline'
  | 'companies'
  | 'profile'
  | 'notification'

export type PanelLayout = {
  id: PanelId
  top: string
  left: string
  width: number
  delay: number
}

type HoloPanelProps = {
  id: PanelId
  delay?: number
  className?: string
  style?: React.CSSProperties
  children: ReactNode
  reduceMotion?: boolean
}

export function HoloPanel({
  delay = 0,
  className,
  style,
  children,
  reduceMotion,
}: HoloPanelProps) {
  return (
    <motion.div
      className={cn(
        'glass-card pointer-events-none relative overflow-hidden rounded-xl border border-white/[0.06] opacity-50',
        className,
      )}
      style={style}
      animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
      transition={
        reduceMotion
          ? undefined
          : {
              y: { duration: 4 + delay, repeat: Infinity, ease: 'easeInOut' },
            }
      }
    >
      {children}
    </motion.div>
  )
}
