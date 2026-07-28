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
import { Check } from 'lucide-react'

import { Button, type ButtonProps } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCookieConsent } from '@/components/consent/CookieConsentProvider'
import { cn } from '@/lib/utils'
import { isWaitlistMode } from '@/lib/waitlist-mode'

type Status = 'idle' | 'loading' | 'success' | 'already' | 'error'
type JoinedKind = 'success' | 'already'

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

function WaitlistForm({
  source,
  onDone,
  onJoined,
}: {
  source: string
  onDone?: () => void
  /** When set (dialog), parent swaps to the thank-you card instead of inline copy. */
  onJoined?: (kind: JoinedKind) => void
}) {
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
        if (onJoined) {
          onJoined('already')
        } else {
          setMessage("You're already on the list — we'll email you when access opens.")
        }
      } else {
        setStatus('success')
        form.reset()
        onDone?.()
        if (onJoined) {
          onJoined('success')
        } else {
          setMessage("You're on the list. We'll email you when Scout opens more seats.")
        }
      }
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  const isBusy = status === 'loading'
  const isDone = status === 'success' || status === 'already'
  const isError = status === 'error'

  return (
    <div className="w-full">
      <form
        className="relative flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-0"
        onSubmit={handleSubmit}
      >
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
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="you@university.edu"
          aria-label="Email address"
          aria-invalid={isError || undefined}
          aria-describedby={message ? `waitlist-msg-${source}` : undefined}
          disabled={isBusy || isDone}
          className={cn(
            'font-body w-full rounded-md border bg-white/[0.03] px-3.5 py-3 text-[16px] text-white placeholder:text-[#A1A1AA] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-60 sm:px-4 sm:py-3 sm:pr-36 sm:text-[14.5px]',
            isError ? 'border-[#f87171]/60' : 'border-white/10 focus:border-white/25',
          )}
        />
        <Button
          type="submit"
          size="sm"
          disabled={isDone}
          loading={isBusy}
          className="min-h-10 w-full sm:absolute sm:right-1.5 sm:top-1/2 sm:min-h-9 sm:w-auto sm:-translate-y-1/2"
        >
          {isBusy ? 'Joining…' : isDone ? 'Joined' : 'Join waitlist'}
        </Button>
      </form>
      {message ? (
        <p
          id={`waitlist-msg-${source}`}
          role={isError ? 'alert' : 'status'}
          aria-live={isError ? 'assertive' : 'polite'}
          className={`mt-3 font-body text-[13px] ${
            isError ? 'text-[#f87171]' : 'text-[#A1A1AA]'
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}

function WaitlistThanks({
  kind,
  onClose,
}: {
  kind: JoinedKind
  onClose: () => void
}) {
  const already = kind === 'already'

  return (
    <div className="animate-content-swap flex flex-col items-start text-left">
      <p className="font-label text-[10px] font-medium uppercase tracking-[0.2em] text-[#FF6733] sm:text-[11px]">
        Beta
      </p>
      <div
        aria-hidden
        className="mt-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#FF6733]/25 bg-[#FF6733]/10 sm:mt-5 sm:h-11 sm:w-11"
      >
        <Check className="h-4 w-4 text-[#FF6733] sm:h-5 sm:w-5" strokeWidth={2.25} />
      </div>
      <DialogHeader className="mt-3 space-y-1.5 text-left sm:mt-4 sm:space-y-2">
        <DialogTitle className="font-headline text-xl font-medium tracking-[-0.03em] text-white sm:text-2xl">
          {already ? "You're already on the list" : "You're on the list"}
        </DialogTitle>
        <DialogDescription className="font-body text-[13.5px] leading-relaxed text-[#A1A1AA] sm:text-[15px]">
          {already
            ? "Thanks for checking in — we'll email you as soon as a seat opens up."
            : "Thanks for signing up. We'll email you the moment Scout opens more seats."}
        </DialogDescription>
      </DialogHeader>
      <Button
        type="button"
        variant="outline"
        className="mt-5 min-h-10 w-full sm:mt-6 sm:min-h-11 sm:w-auto"
        onClick={onClose}
      >
        Got it
      </Button>
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
  const [joined, setJoined] = useState<JoinedKind | null>(null)

  useEffect(() => {
    if (!open) setJoined(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile: compact centered card with side margins — not a full-bleed takeover.
          'w-[calc(100%-2.5rem)] max-w-[22rem] gap-3 overflow-y-auto rounded-2xl border-white/10 bg-[#0c0c0e] p-4',
          'max-h-[min(85dvh,32rem)]',
          // Desktop: keep the polished wider modal.
          'sm:w-full sm:max-w-md sm:gap-4 sm:rounded-2xl sm:p-6 sm:max-h-[min(100dvh,640px)]',
        )}
      >
        {joined ? (
          <WaitlistThanks kind={joined} onClose={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader className="space-y-2 text-left sm:space-y-3">
              <p className="font-label text-[10px] font-medium uppercase tracking-[0.2em] text-[#FF6733] sm:text-[11px]">
                Beta
              </p>
              <DialogTitle className="font-headline text-xl font-medium tracking-[-0.03em] text-white sm:text-2xl">
                Public access is coming soon
              </DialogTitle>
              <DialogDescription className="font-body text-[13.5px] leading-relaxed text-[#A1A1AA] sm:text-[15px]">
                Scout is in private beta while we harden the apply agent. Drop your
                email and we&apos;ll save you a seat when we open up.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-1 sm:mt-2">
              <WaitlistForm source={source} onJoined={setJoined} />
            </div>
          </>
        )}
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
  /** Fires after opening the waitlist dialog (e.g. close mobile nav). */
  onOpen?: () => void
}

/** Primary CTA replacement in waitlist mode — opens the beta waitlist dialog. */
export function ComingSoonCta({
  source = 'cta',
  label = 'Join waitlist now',
  className,
  variant = 'default',
  size = 'lg',
  onOpen,
}: ComingSoonCtaProps) {
  if (!isWaitlistMode()) return null
  return (
    <ComingSoonCtaInner
      source={source}
      label={label}
      className={className}
      variant={variant}
      size={size}
      onOpen={onOpen}
    />
  )
}

function ComingSoonCtaInner({
  source,
  label,
  className,
  variant,
  size,
  onOpen,
}: Required<Pick<ComingSoonCtaProps, 'source' | 'label'>> &
  Omit<ComingSoonCtaProps, 'source' | 'label'>) {
  const { open } = useWaitlist()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        open(source)
        onOpen?.()
      }}
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
  onOpen,
}: {
  source?: string
  children?: ReactNode
  className?: string
  onOpen?: () => void
}) {
  if (!isWaitlistMode()) return null
  return (
    <WaitlistOpenButtonInner source={source} className={className} onOpen={onOpen}>
      {children}
    </WaitlistOpenButtonInner>
  )
}

function WaitlistOpenButtonInner({
  source,
  children,
  className,
  onOpen,
}: {
  source: string
  children: ReactNode
  className?: string
  onOpen?: () => void
}) {
  const { open } = useWaitlist()
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        open(source)
        onOpen?.()
      }}
    >
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

/** Thumb-zone sticky CTA for phones — waitlist mode only. */
export function MobileWaitlistDock() {
  if (!isWaitlistMode()) return null
  return <MobileWaitlistDockInner />
}

function MobileWaitlistDockInner() {
  const { open } = useWaitlist()
  const { consent, isBannerOpen } = useCookieConsent()
  const [heroCtaVisible, setHeroCtaVisible] = useState(true)

  useEffect(() => {
    const el = document.getElementById('hero-waitlist')
    if (!el) {
      setHeroCtaVisible(false)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setHeroCtaVisible(entry.isIntersecting)
      },
      { threshold: 0.4, rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Don't fight the cookie banner for the thumb zone on first visit.
  if (isBannerOpen || consent === null) return null
  // Hide while the hero waitlist CTA is on screen — avoids double-CTA clash.
  if (heroCtaVisible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <Button
        type="button"
        size="default"
        className="pointer-events-auto min-h-10 rounded-full px-5 shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
        onClick={() => open('mobile_dock')}
      >
        Join waitlist
      </Button>
    </div>
  )
}
