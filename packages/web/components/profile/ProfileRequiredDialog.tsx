'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ProfileRequiredDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingFieldLabels?: string[]
}

export function ProfileRequiredDialog({
  open,
  onOpenChange,
  missingFieldLabels = [],
}: ProfileRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong max-w-md gap-5 rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-7 text-white">
        <DialogHeader className="text-left sm:text-left">
          <DialogTitle className="font-headline text-xl font-medium tracking-[-0.02em] text-white">
            Complete your profile first
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-[#999]">
            Scout needs your application details before it can apply on your
            behalf. This is a one-time setup — you won&apos;t need to fill this
            out again.
          </DialogDescription>
        </DialogHeader>

        {missingFieldLabels.length > 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="font-label text-[10px] font-medium uppercase tracking-[0.16em] text-[#666]">
              Still needed
            </p>
            <ul className="mt-2 space-y-1 font-body text-sm text-[#bbb]">
              {missingFieldLabels.map((label) => (
                <li key={label}>• {label}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button asChild className="h-11 w-full">
            <Link href="/profile" onClick={() => onOpenChange(false)}>
              Go to profile
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
