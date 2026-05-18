'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { ProUpgradeDialog } from '@/components/ProUpgradeDialog'
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

      <ProUpgradeDialog
        open={open}
        onOpenChange={setOpen}
        title="Send Scout is a Pro feature"
        description="Upgrade to let Scout apply to internships on your behalf automatically. Free accounts can still browse jobs and view their score."
      />
    </>
  )
}
