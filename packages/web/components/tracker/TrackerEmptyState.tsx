'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

import { scoutLogo } from '@/lib/scout-logo'

export function TrackerEmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <motion.div
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="h-16 w-16 shrink-0"
      >
        <Image
          src={scoutLogo}
          alt="Scout"
          width={64}
          height={64}
          className="h-16 w-16 object-contain"
        />
      </motion.div>
      <h2 className="mt-6 font-headline text-2xl font-medium text-white">
        No applications yet
      </h2>
      <p className="mt-2 max-w-xs font-body text-sm text-[#555]">
        Head to Explore to find your matches and send Scout.
      </p>
      <Link
        href="/explore"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97]"
      >
        Go to Explore →
      </Link>
    </div>
  )
}
