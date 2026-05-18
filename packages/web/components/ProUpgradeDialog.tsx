'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
          <button
            type="button"
            onClick={() => {
              onOpenChange(false)
              router.push('/pricing')
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#FF6733] px-6 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-[0.97] sm:w-auto"
          >
            Upgrade to Pro
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-11 items-center justify-center rounded-full px-6 font-label text-sm font-medium text-[#999] transition-colors hover:text-white"
          >
            Maybe later
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
