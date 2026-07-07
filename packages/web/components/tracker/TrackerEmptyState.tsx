'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
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
      <Button asChild className="mt-6">
        <Link href="/explore">Go to Explore →</Link>
      </Button>
    </div>
  )
}
