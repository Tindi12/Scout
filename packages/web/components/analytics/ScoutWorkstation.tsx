'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import { scoutLogo } from '@/lib/scout-logo'

const TYPING_TEXT = 'coming soon...'

type ScoutWorkstationProps = {
  reduceMotion?: boolean
}

export function ScoutWorkstation({ reduceMotion }: ScoutWorkstationProps) {
  const [charIndex, setCharIndex] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (reduceMotion) {
      setCharIndex(TYPING_TEXT.length)
      setDone(true)
      return
    }
    if (done) return
    if (charIndex < TYPING_TEXT.length) {
      const t = setTimeout(() => setCharIndex((c) => c + 1), 55)
      return () => clearTimeout(t)
    }
    setDone(true)
  }, [charIndex, done, reduceMotion])

  const displayLine = reduceMotion
    ? TYPING_TEXT
    : TYPING_TEXT.slice(0, charIndex)

  return (
    <div className="relative z-20 flex flex-col items-center">
      <motion.div
        className="glass-card flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] md:h-24 md:w-24"
        animate={reduceMotion ? undefined : { opacity: [0.88, 1, 0.88] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <Image
          src={scoutLogo}
          alt="Scout"
          width={56}
          height={56}
          className="h-12 w-12 object-contain md:h-14 md:w-14"
        />
      </motion.div>
      <div className="mt-3 hidden rounded-lg border border-white/[0.06] bg-black/40 px-3 py-1.5 font-mono text-[10px] text-[#555] md:block">
        <span className="text-[#FF6733]">&gt;</span> {displayLine}
        <span className="animate-cursor-blink text-[#FF6733]">▌</span>
      </div>
    </div>
  )
}
