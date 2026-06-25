'use client'

import { useClerk } from '@clerk/nextjs'
import { AlertTriangle, LogOut } from 'lucide-react'
import { useState } from 'react'

import { SettingsSection } from '@/components/settings/SettingsSection'

export function AccountActionsSection() {
  const { signOut } = useClerk()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = () => {
    setSigningOut(true)
    void signOut({ redirectUrl: '/' })
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
                Account deletion is not available yet. Contact support if you
                need help.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-full border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 font-label text-xs font-medium text-[#ef4444]/70"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}
