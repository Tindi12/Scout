'use client'

import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { SettingsSection } from '@/components/settings/SettingsSection'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

type CredentialsState = {
  has_password: boolean
  usajobs_email: string | null
}

const PRIMARY_BTN =
  'inline-flex h-10 items-center justify-center rounded-full border border-[#FF6733]/40 bg-[#FF6733]/[0.1] px-5 font-label text-sm font-medium text-white transition-all duration-200 hover:bg-[#FF6733]/[0.18] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50'

export function UsajobsCredentialsSection() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch('/api/user/usajobs-credentials', {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = (await res.json()) as CredentialsState
        if (!active) return
        setEmail(data.usajobs_email ?? '')
        setHasPassword(Boolean(data.has_password))
      } catch {
        // Leave the form empty; the user can still set credentials.
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function save(payload: Record<string, string>, successMsg: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/user/usajobs-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = (await res.json()) as CredentialsState
      setEmail(data.usajobs_email ?? '')
      setHasPassword(Boolean(data.has_password))
      setPassword('')
      toast({ title: 'Saved', description: successMsg, duration: 1800 })
    } catch {
      toast({
        title: 'Could not save',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 2400,
      })
    } finally {
      setSaving(false)
    }
  }

  function onSave() {
    // Always send email. Only send the password when the user typed one, so a blank
    // field doesn't wipe an already-saved password.
    const payload: Record<string, string> = { usajobs_email: email.trim() }
    if (password.length > 0) payload.usajobs_password = password
    void save(payload, 'USAJobs credentials updated.')
  }

  return (
    <SettingsSection
      title="USAJobs credentials"
      icon={KeyRound}
      description="Used only by Scout to sign in to USAJobs when applying on your behalf. Your password is encrypted before it's stored and is never shown back to you."
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usajobs-email" className="text-sm text-[#888]">
              USAJobs email
            </label>
            <Input
              id="usajobs-email"
              type="email"
              autoComplete="off"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="usajobs-password" className="text-sm text-[#888]">
              USAJobs password
            </label>
            <Input
              id="usajobs-password"
              type="password"
              autoComplete="new-password"
              placeholder={
                hasPassword ? 'Saved — leave blank to keep current' : 'Enter password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {hasPassword ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void save({ usajobs_password: '' }, 'USAJobs password removed.')
                }
                className="self-start text-xs text-[#888] underline-offset-2 transition-colors hover:text-[#FF6733] hover:underline disabled:opacity-50"
              >
                Remove saved password
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={PRIMARY_BTN}
          >
            {saving ? 'Saving…' : 'Save credentials'}
          </button>
        </>
      )}
    </SettingsSection>
  )
}
