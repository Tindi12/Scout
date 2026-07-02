'use client'

import { useClerk } from '@clerk/nextjs'
import { AlertTriangle, LogOut, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { SettingsSection } from '@/components/settings/SettingsSection'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTier } from '@/hooks/use-tier'
import { resetUser } from '@/lib/analytics'

const CONFIRM_WORD = 'DELETE'

const DELETED_ITEMS = [
  'Your profile, preferences, and settings',
  'All resumes, tailored variants, and cover letters',
  'Your application history and Scout runs',
  'Saved data, conversations, and notifications',
  'Connected email access and stored credentials',
]

export function AccountActionsSection() {
  const { signOut } = useClerk()
  const { isPaid } = useTier()
  const [signingOut, setSigningOut] = useState(false)

  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmed = confirmText.trim() === CONFIRM_WORD

  const handleSignOut = () => {
    setSigningOut(true)
    void signOut({ redirectUrl: '/' })
  }

  const handleOpenChange = (next: boolean) => {
    if (deleting) return // no closing mid-deletion
    setOpen(next)
    if (!next) {
      setConfirmText('')
      setError(null)
    }
  }

  const handleDelete = async () => {
    if (!confirmed || deleting) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          detail?: unknown
        } | null
        const detail =
          typeof body?.detail === 'string'
            ? body.detail
            : 'Deletion could not be completed. Nothing is left half-deleted — please try again.'
        setError(detail)
        setDeleting(false)
        return
      }
      // Account is gone everywhere. Clear the analytics identity, then leave — the
      // Clerk session no longer exists, so fall back to a hard redirect if signOut
      // trips over the missing session.
      resetUser()
      try {
        await signOut({ redirectUrl: '/?account_deleted=1' })
      } catch {
        window.location.assign('/?account_deleted=1')
      }
    } catch {
      setError('Something went wrong. Your account was not fully deleted — please try again.')
      setDeleting(false)
    }
  }

  return (
    <SettingsSection
      title="Account Actions"
      icon={LogOut}
      description="Sign out or manage destructive account options."
    >
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors duration-150 hover:border-white/10 hover:bg-white/[0.04] disabled:opacity-60"
      >
        <LogOut
          className="h-[18px] w-[18px] shrink-0 text-[#555] transition-colors group-hover:text-[#FF6733]"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="font-label text-sm font-medium text-[#999] transition-colors group-hover:text-white">
          {signingOut ? 'Signing out…' : 'Log out'}
        </span>
      </button>

      <div className="rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/[0.04] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#ef4444]"
            strokeWidth={1.75}
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="font-label text-sm font-medium text-white">
                Danger zone
              </h3>
              <p className="mt-1 text-xs text-[#888]">
                Permanently delete your account and all of your data. This
                cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 font-label text-xs font-medium text-[#ef4444] transition-colors hover:border-[#ef4444]/50 hover:bg-[#ef4444]/20"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Delete account
            </button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="border-white/10 bg-[#111113] text-white sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg text-white">
              Delete your account?
            </DialogTitle>
            <DialogDescription className="text-sm text-[#A1A1AA]">
              This is <span className="font-semibold text-[#ef4444]">permanent and irreversible</span>.
              The following will be deleted immediately:
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5 text-sm text-[#A1A1AA]">
            {DELETED_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#ef4444]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          {isPaid ? (
            <div className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/[0.06] px-4 py-3 text-sm text-[#fca5a5]">
              Your paid subscription will be <span className="font-semibold">canceled immediately</span> and
              you lose access right away. No refund is issued for the remainder
              of the billing period.
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="delete-confirm" className="text-xs text-[#888]">
              Type <span className="font-mono font-semibold text-white">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              placeholder={CONFIRM_WORD}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-[#555] focus:border-[#ef4444]/50 focus:outline-none disabled:opacity-60"
            />
          </div>

          {error ? (
            <p className="text-sm text-[#ef4444]" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={deleting}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-medium text-[#bbb] transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!confirmed || deleting}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#ef4444]/40 bg-[#ef4444]/15 px-5 font-label text-sm font-medium text-[#ef4444] transition-colors hover:bg-[#ef4444]/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
