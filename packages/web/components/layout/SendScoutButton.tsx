'use client'

import { motion, useAnimation } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ProUpgradeDialog } from '@/components/ProUpgradeDialog'
import { useExploreBatchOptional } from '@/contexts/explore-batch-context'
import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

export type SendScoutVariant = 'sidebar' | 'topbar' | 'fab'

type SendScoutButtonProps = {
  variant?: SendScoutVariant
  isPro?: boolean
  className?: string
}

const SEND_BUTTON_REST_SHADOW = '0 0 40px rgba(255,103,51,0.38)'
const SEND_BUTTON_PULSE_SHADOW = '0 0 60px rgba(255,103,51,0.7)'

/** Muted top-bar pill — no orange fill or glow (all pages except active Explore). */
const DORMANT_CLASSES =
  'cursor-default border border-white/[0.08] bg-white/[0.04] text-[#666] shadow-none ring-0 saturate-[0.25] hover:border-white/[0.1] hover:bg-white/[0.05] hover:shadow-none hover:text-[#888] active:scale-100'

/** Active only on Explore when jobs are selected. */
const ACTIVE_CLASSES =
  'border border-transparent bg-[#CC5229] text-white shadow-[0_0_24px_rgba(204,82,41,0.38)] hover:shadow-[0_0_32px_rgba(204,82,41,0.55)] active:scale-[0.97]'

export function SendScoutButton({
  variant = 'sidebar',
  isPro = false,
  className,
}: SendScoutButtonProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const exploreBatch = useExploreBatchOptional()
  const controls = useAnimation()

  const isExploreRoute =
    pathname === '/explore' || pathname?.startsWith('/explore/')
  const batch = isExploreRoute ? exploreBatch?.batch : null
  const isTopbar = variant === 'topbar'
  const pulseNonce = exploreBatch?.pulseNonce ?? 0

  const canSend =
    isExploreRoute &&
    batch != null &&
    batch.selectedCount > 0 &&
    !batch.isSending

  const isDormant = isTopbar && !canSend && !batch?.isSending

  // Clear any orange glow left over from Explore when leaving or deselecting.
  useEffect(() => {
    if (!isTopbar) return
    if (canSend) return
    controls.stop()
    void controls.set({ scale: 1, boxShadow: '0px 0px 0px rgba(0,0,0,0)' })
  }, [isTopbar, canSend, controls, pathname])

  // One-time attention pulse — Explore only, when jobs are selected.
  useEffect(() => {
    if (!isTopbar || !canSend) return
    if (pulseNonce === 0) return
    void controls.start({
      scale: [1, 1.04, 1],
      boxShadow: [
        SEND_BUTTON_REST_SHADOW,
        SEND_BUTTON_PULSE_SHADOW,
        SEND_BUTTON_REST_SHADOW,
      ],
      transition: { duration: 0.6, ease: 'easeInOut' },
    })
  }, [isTopbar, canSend, pulseNonce, controls])

  const logo = (
    <Image
      src={scoutLogo}
      alt=""
      width={20}
      height={20}
      draggable={false}
      className={cn(
        'h-5 w-5 select-none object-contain transition-opacity',
        isDormant && 'opacity-35 grayscale',
      )}
    />
  )

  const handleTopbarClick = () => {
    if (batch?.isSending) return
    if (canSend && batch) {
      batch.onSend()
      return
    }
    if (!isPro) {
      setOpen(true)
      return
    }
    router.push('/explore')
  }

  if (!isTopbar) {
    return null
  }

  const label =
    canSend && batch ? `Send Scout (${batch.selectedCount})` : 'Send Scout'

  const dormantTitle = isExploreRoute
    ? 'Select jobs below, then send Scout from here'
    : 'Open Jobs to select roles and send Scout'

  const sharedLayout =
    'relative inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 font-label text-xs font-semibold transition-colors duration-200 sm:gap-2 sm:px-5 sm:text-sm'

  const proDialog = (
    <ProUpgradeDialog
      open={open}
      onOpenChange={setOpen}
      title="Send Scout is a Pro feature"
      description="Upgrade to let Scout apply to internships on your behalf. Select jobs on Explore and send Scout from the top bar."
    />
  )

  // Dormant: plain button — no Framer Motion, no orange shadow or pulse.
  if (isDormant) {
    return (
      <>
        <button
          type="button"
          onClick={handleTopbarClick}
          title={dormantTitle}
          className={cn(sharedLayout, DORMANT_CLASSES, className)}
        >
          {logo}
          <span>{label}</span>
        </button>
        {proDialog}
      </>
    )
  }

  // Active / sending on Explore only — motion + orange glow allowed here.
  return (
    <>
      <motion.button
        type="button"
        onClick={handleTopbarClick}
        disabled={Boolean(batch?.isSending)}
        animate={controls}
        initial={{ boxShadow: SEND_BUTTON_REST_SHADOW }}
        whileHover={
          canSend ? { boxShadow: '0 0 48px rgba(204,82,41,0.55)' } : undefined
        }
        whileTap={canSend ? { scale: 0.97 } : undefined}
        className={cn(
          sharedLayout,
          ACTIVE_CLASSES,
          batch?.isSending && 'cursor-wait opacity-80',
          className,
        )}
      >
        {batch?.isSending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            <span>Sending…</span>
          </>
        ) : (
          <>
            {logo}
            <span>{label}</span>
          </>
        )}
        {canSend ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
        ) : null}
      </motion.button>
      {proDialog}
    </>
  )
}
