'use client'

import { animate, useInView, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'

type CountUpProps = {
  to: number
  suffix?: string
  duration?: number
  format?: (value: number) => string
  fallback: string
}

function defaultFormat(n: number) {
  return Math.round(n).toLocaleString('en-US')
}

export function CountUp({
  to,
  suffix = '',
  duration = 2.2,
  format = defaultFormat,
  fallback,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const motionValue = useMotionValue(0)
  const rendered = useTransform(motionValue, (v) => format(v))

  useEffect(() => {
    if (!inView) return
    const controls = animate(motionValue, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    })
    return () => controls.stop()
  }, [inView, motionValue, to, duration])

  useEffect(() => {
    if (!ref.current) return
    const unsubscribe = rendered.on('change', (latest) => {
      if (ref.current) ref.current.textContent = `${latest}${suffix}`
    })
    return () => unsubscribe()
  }, [rendered, suffix])

  return (
    <span ref={ref} aria-label={fallback}>
      {fallback}
    </span>
  )
}
