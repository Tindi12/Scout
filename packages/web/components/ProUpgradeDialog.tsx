'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import { scoutLogo } from '@/lib/scout-logo'

type ProUpgradeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
}

export function ProUpgradeDialog({
  open,
  onOpenChange,
  title,
  description,
}: ProUpgradeDialogProps) {
  const router = useRouter()

  // Funnel step: an in-app upgrade CTA was surfaced. `title` distinguishes which
  // gate triggered it (e.g. "Send Scout is a Pro feature") without any PII.
  useEffect(() => {
    if (open) {
      track(ANALYTICS_EVENTS.UPGRADE_VIEWED, { source: 'gate_dialog', gate: title })
    }
  }, [open, title])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            {title}
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-[#999]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => {
              onOpenChange(false)
              router.push('/pricing')
            }}
          >
            Upgrade to Pro
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
