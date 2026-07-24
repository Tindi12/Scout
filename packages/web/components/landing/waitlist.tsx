'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { isWaitlistMode } from '@/lib/waitlist-mode'

type Status = 'idle' | 'loading' | 'success' | 'already' | 'error'

type WaitlistContextValue = {
  open: (source?: string) => void
  close: () => void
}

const WaitlistContext = createContext<WaitlistContextValue | null>(null)

export function useWaitlist() {
  const ctx = useContext(WaitlistContext)
  if (!ctx) {
    throw new Error('useWaitlist must be used within WaitlistProvider')
  }
  return ctx
}

function WaitlistForm({ source, onDone }: { source: string; onDone?: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const email = (data.get('email') as string | null)?.trim()
    const website = (data.get('website') as string | null) ?? ''
    if (!email) return

    setStatus('loading')
    setMessage(null)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, website }),
      })
      const payload = (await res.json().catch(() => null)) as {
        status?: string
        detail?: string
      } | null

      if (!res.ok) {
        setStatus('error')
        setMessage(payload?.detail || 'Something went wrong. Please try again.')
        return
      }

      if (payload?.status === 'already') {
        setStatus('already')
        setMessage("You're already on the list — we'll email you when access opens.")
      } else {
        setStatus('success')
        setMessage("You're on the list. We'll email you when Scout opens more seats.")
        form.reset()
        onDone?.()
      }
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  const isBusy = status === 'loading'
  const isDone = status === 'success' || status === 'already'

  return (
    <div className="w-full">
      <form className="relative flex w-full items-center" onSubmit={handleSubmit}>
        {/* Honeypot — visually hidden from humans */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-0 w-0 opacity-0"
        />
        <input
          type="email"
          name="email"
          required
          placeholder="you@university.edu"
          aria-label="Email address"
          disabled={isBusy || isDone}
          className="font-body w-full rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 pr-36 text-[14.5px] text-white placeholder:text-[#888888] transition-colors duration-150 focus:border-white/25 focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" size="sm" disabled={isDone} loading={isBusy} className="absolute right-1.5">
          {isBusy ? 'Joining…' : isDone ? 'Joined' : 'Join waitlist'}
        </Button>
      </form>
      {message ? (
        <p
          role="status"
          className={`mt-3 font-body text-[13px] ${
            status === 'error' ? 'text-[#f87171]' : 'text-[#A1A1AA]'
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}

function WaitlistDialog({
  open,
  source,
  onOpenChange,
}: {
  open: boolean
  source: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0c0c0e] sm:rounded-2xl">
        <DialogHeader className="space-y-3 text-left">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            Beta
          </p>
          <DialogTitle className="font-headline text-2xl font-medium tracking-[-0.03em] text-white">
            Public access is coming soon
          </DialogTitle>
          <DialogDescription className="font-body text-[15px] leading-relaxed text-[#A1A1AA]">
            Scout is in private beta while we harden the apply agent. Drop your email and
            we&apos;ll save you a seat when we open up.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <WaitlistForm source={source} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Mount once near the landing chrome. Opens from any ComingSoonCta / WaitlistOpenButton,
 * and from `?waitlist=1` (used when /sign-up is redirected in waitlist mode).
 *
 * Reads the query string in an effect (not useSearchParams) so we don't need a Suspense
 * boundary around the whole app — that was shifting Radix useId() and hydrating FAQ wrong.
 */
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const enabled = isWaitlistMode()
  const [isOpen, setIsOpen] = useState(false)
  const [source, setSource] = useState('landing')

  const open = useCallback((nextSource = 'landing') => {
    setSource(nextSource)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (!enabled) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('waitlist') !== '1') return
    setSource('signup_redirect')
    setIsOpen(true)
    url.searchParams.delete('waitlist')
    const qs = url.searchParams.toString()
    const next = qs ? `${url.pathname}?${qs}` : url.pathname
    window.history.replaceState(window.history.state, '', next)
  }, [enabled])

  const value = useMemo(() => ({ open, close }), [open, close])

  if (!enabled) return <>{children}</>

  return (
    <WaitlistContext.Provider value={value}>
      {children}
      <WaitlistDialog open={isOpen} source={source} onOpenChange={setIsOpen} />
    </WaitlistContext.Provider>
  )
}

type ComingSoonCtaProps = {
  source?: string
  label?: string
  className?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
}

/** Primary CTA replacement in waitlist mode — opens the beta waitlist dialog. */
export function ComingSoonCta({
  source = 'cta',
  label = 'Coming soon',
  className,
  variant = 'default',
  size = 'lg',
}: ComingSoonCtaProps) {
  if (!isWaitlistMode()) return null
  return (
    <ComingSoonCtaInner
      source={source}
      label={label}
      className={className}
      variant={variant}
      size={size}
    />
  )
}

function ComingSoonCtaInner({
  source,
  label,
  className,
  variant,
  size,
}: Required<Pick<ComingSoonCtaProps, 'source' | 'label'>> &
  Omit<ComingSoonCtaProps, 'source' | 'label'>) {
  const { open } = useWaitlist()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => open(source)}
    >
      {label}
    </Button>
  )
}

/** Text-style control that opens the waitlist dialog (nav / footer). */
export function WaitlistOpenButton({
  source = 'nav',
  children = 'Join waitlist',
  className,
}: {
  source?: string
  children?: ReactNode
  className?: string
}) {
  if (!isWaitlistMode()) return null
  return (
    <WaitlistOpenButtonInner source={source} className={className}>
      {children}
    </WaitlistOpenButtonInner>
  )
}

function WaitlistOpenButtonInner({
  source,
  children,
  className,
}: {
  source: string
  children: ReactNode
  className?: string
}) {
  const { open } = useWaitlist()
  return (
    <button type="button" className={className} onClick={() => open(source)}>
      {children}
    </button>
  )
}

/** Inline footer waitlist form (replaces newsletter when waitlist mode is on). */
export function WaitlistInlineForm({ source = 'footer' }: { source?: string }) {
  return (
    <div className={cn('relative w-full')}>
      <WaitlistForm source={source} />
    </div>
  )
}
