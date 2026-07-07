'use client'

import { Mail } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { MAIL_PROVIDER_LOGOS } from '@/lib/ats-logos'

type MailConnectionState = {
  connected: boolean
  pending: boolean
  provider: 'google' | 'microsoft' | null
  address: string | null
  connected_at: string | null
  available: boolean
}

type MailProvider = 'google' | 'microsoft'

type MailReturnTo = '/dashboard' | '/settings'

const PROVIDER_LABELS: Record<MailProvider, string> = {
  google: 'Gmail',
  microsoft: 'Outlook',
}

const PROVIDER_LOGOS = MAIL_PROVIDER_LOGOS

/**
 * Why this exists: some job sites (notably Greenhouse) email an 8-character
 * verification code at submit time. With a mailbox connected, Scout retrieves that
 * code automatically mid-application; without one, the user has to paste it into the
 * tracker within a few minutes. OAuth is hosted by Composio (managed auth) — Scout
 * never sees or stores the mail password/token, and access is read-only.
 */
export function useMailConnection(options?: { returnTo?: MailReturnTo }) {
  const returnTo = options?.returnTo ?? '/settings'
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // Which provider's consent screen we're opening — per-provider so the Gmail
  // button doesn't show "Opening…" when the user clicked Outlook (and vice versa).
  const [connecting, setConnecting] = useState<MailProvider | null>(null)
  const [state, setState] = useState<MailConnectionState | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/user/mail-connection', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setState((await res.json()) as MailConnectionState)
    } catch {
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = useCallback(
    async (provider: MailProvider) => {
      setConnecting(provider)
      try {
        const res = await fetch('/api/user/mail-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, return_to: returnTo }),
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = (await res.json()) as { redirect_url?: string }
        if (!data.redirect_url) throw new Error('No redirect URL')
        // Off to Composio's hosted consent screen; returns to returnTo when done.
        window.location.href = data.redirect_url
      } catch {
        setConnecting(null)
        toast({
          title: 'Could not start the connection',
          description: 'Please try again in a moment.',
          variant: 'destructive',
          duration: 2400,
        })
      }
    },
    [returnTo, toast],
  )

  const disconnect = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/user/mail-connection', { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setState((await res.json()) as MailConnectionState)
      toast({ title: 'Disconnected', description: 'Email access removed.', duration: 1800 })
    } catch {
      toast({
        title: 'Could not disconnect',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 2400,
      })
    } finally {
      setBusy(false)
    }
  }, [toast])

  return { loading, busy, connecting, state, connect, disconnect, refresh }
}

function Disclosure() {
  return (
    <p className="text-xs leading-relaxed text-[#666]">
      You&apos;ll approve access on the secure consent screen of Composio, our email
      integration partner — Scout never sees your password or mail token. Access is{' '}
      <span className="text-[#999]">read-only</span> and used exclusively to retrieve
      job-application verification codes while Scout is applying for you. Scout never
      sends, deletes, or stores your email.
    </p>
  )
}

function ProviderButton({
  provider,
  connecting,
  onConnect,
}: {
  provider: MailProvider
  connecting: MailProvider | null
  onConnect: (provider: MailProvider) => void
}) {
  const isOpening = connecting === provider
  return (
    <Button
      type="button"
      disabled={connecting !== null}
      onClick={() => onConnect(provider)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PROVIDER_LOGOS[provider]}
        alt=""
        aria-hidden
        height={16}
        className="mr-2 h-4 w-auto max-w-5 shrink-0 object-contain"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      {isOpening ? 'Opening…' : `Connect ${PROVIDER_LABELS[provider]}`}
    </Button>
  )
}

function ProviderButtons({
  connecting,
  onConnect,
}: {
  connecting: MailProvider | null
  onConnect: (provider: MailProvider) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <ProviderButton provider="google" connecting={connecting} onConnect={onConnect} />
      <ProviderButton provider="microsoft" connecting={connecting} onConnect={onConnect} />
    </div>
  )
}

export function ConnectMailSection() {
  const { loading, busy, connecting, state, connect, disconnect } = useMailConnection()

  return (
    <SettingsSection
      title="Email connection"
      icon={Mail}
      description="Some job sites email a verification code before accepting an application. Connect your inbox so Scout can pick up those codes automatically — otherwise you'll be asked to paste them in while a run is live."
    >
      {loading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : state && !state.available ? (
        <p className="text-sm text-[#888]">
          Email connection isn&apos;t configured on this server.
        </p>
      ) : state?.connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            {state.provider ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={PROVIDER_LOGOS[state.provider]}
                alt=""
                aria-hidden
                height={18}
                className="h-[18px] w-auto max-w-6 shrink-0 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <p className="text-sm text-white">
              Connected{state.provider ? ` — ${PROVIDER_LABELS[state.provider]}` : ''}
              {state.address ? (
                <span className="text-[#888]"> ({state.address})</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="self-start text-xs text-[#888] underline-offset-2 transition-colors hover:text-[#FF6733] hover:underline disabled:opacity-50"
          >
            Disconnect and revoke access
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ProviderButtons connecting={connecting} onConnect={(p) => void connect(p)} />
          <Disclosure />
        </div>
      )}
    </SettingsSection>
  )
}

/** Compact variant for the onboarding flow — same actions, skippable. */
export function ConnectMailCard({ onSkip }: { onSkip: () => void }) {
  const { loading, busy, connecting, state, connect } = useMailConnection({
    returnTo: '/dashboard',
  })
  const unavailable = !loading && state != null && !state.available

  return (
    <div className="glass-card w-full rounded-2xl border border-white/[0.06] p-6 text-left">
      <div className="flex items-center gap-2.5">
        <Mail className="h-5 w-5 text-[#FF6733]" strokeWidth={1.8} />
        <h2 className="font-headline text-lg font-medium text-white">
          Let Scout handle email verification codes
        </h2>
      </div>
      <p className="mt-3 font-body text-sm leading-relaxed text-[#999]">
        Some job sites email you a code before accepting an application. Connect your
        inbox and Scout enters those codes automatically while applying — no waiting
        by your email.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        {loading ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : unavailable || state?.connected ? null : (
          <>
            <ProviderButtons connecting={connecting} onConnect={(p) => void connect(p)} />
            <Disclosure />
          </>
        )}
        <button
          type="button"
          disabled={busy || connecting !== null}
          onClick={onSkip}
          className="self-start text-sm text-[#888] underline-offset-2 transition-colors hover:text-white hover:underline disabled:opacity-50"
        >
          {state?.connected || unavailable ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </div>
  )
}
