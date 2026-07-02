'use client'

import { CheckCircle2, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

/**
 * One-time confirmation shown after self-serve account deletion redirects here
 * with ?account_deleted=1. Dismissing also cleans the param out of the URL so a
 * refresh or share doesn't resurface it.
 */
export function AccountDeletedNotice() {
  const searchParams = useSearchParams()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || searchParams.get('account_deleted') !== '1') return null

  const dismiss = () => {
    setDismissed(true)
    const url = new URL(window.location.href)
    url.searchParams.delete('account_deleted')
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div
        role="status"
        className="flex items-center gap-3 rounded-full border border-white/10 bg-[#111113]/95 py-2.5 pl-4 pr-2.5 shadow-xl backdrop-blur"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22c55e]" strokeWidth={1.75} aria-hidden />
        <span className="text-sm text-white">
          Your account has been deleted. Sorry to see you go.
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full p-1.5 text-[#888] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
