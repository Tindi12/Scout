'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

export type SendScoutVariant = 'sidebar' | 'topbar' | 'fab'

type SendScoutButtonProps = {
  variant?: SendScoutVariant
  isPro?: boolean
  className?: string
}

const VARIANT_CLASSES: Record<SendScoutVariant, string> = {
  sidebar:
    'h-11 w-full gap-2 px-5 text-sm',
  topbar:
    'hidden h-10 gap-2 px-5 text-sm sm:inline-flex',
  fab:
    'h-12 gap-2 px-5 text-sm',
}

export function SendScoutButton({
  variant = 'sidebar',
  isPro = false,
  className,
}: SendScoutButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Matches Copilot bubble inner logo circle: #FF6733 with bg-black/20 overlay (~#CC5229)
  const baseClasses =
    'group inline-flex items-center justify-center rounded-full bg-[#CC5229] font-label font-semibold text-white shadow-[0_0_24px_rgba(204,82,41,0.38)] transition-all duration-200 hover:shadow-[0_0_32px_rgba(204,82,41,0.55)] active:scale-[0.97]'

  const content = (
    <>
      <Image
        src={scoutLogo}
        alt=""
        width={20}
        height={20}
        draggable={false}
        className="h-5 w-5 select-none object-contain"
      />
      <span>Send Scout</span>
    </>
  )

  if (isPro) {
    return (
      <Link
        href="/explore"
        className={cn(baseClasses, VARIANT_CLASSES[variant], className)}
      >
        {content}
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(baseClasses, VARIANT_CLASSES[variant], className)}
      >
        {content}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card-strong max-w-md gap-5 rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-7 text-white">
          <DialogHeader className="items-center text-center sm:text-center">
            <Image
              src={scoutLogo}
              alt="Scout"
              width={40}
              height={40}
              className="mb-2 h-10 w-10 select-none object-contain"
            />
            <DialogTitle className="font-headline text-2xl font-medium tracking-[-0.02em] text-white">
              Send Scout is a Pro feature
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-[#999]">
              Upgrade to let Scout apply to internships on your behalf
              automatically. Free accounts can still browse jobs and view
              their score.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="sm:justify-center">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                router.push('/pricing')
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#FF6733] px-6 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-[0.97] sm:w-auto"
            >
              Upgrade to Pro
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-full px-6 font-label text-sm font-medium text-[#999] transition-colors hover:text-white"
            >
              Maybe later
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
