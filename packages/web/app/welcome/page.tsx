'use client'

import { useAuth } from '@clerk/nextjs'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { SecuredByStripe } from '@/components/billing/SecuredByStripe'
import { Button } from '@/components/ui/button'
import { scoutLogo } from '@/lib/scout-logo'
import {
  isPaidUser,
  normalizeSubscriptionPlan,
  planDisplayLabel,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'

const POLL_INTERVAL_MS = 2500
const MAX_ATTEMPTS = 10 // ~25s total before we stop waiting on the webhook

type Status = 'activating' | 'confirmed' | 'timeout'

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { isLoaded, isSignedIn } = useAuth()
  const [status, setStatus] = useState<Status>('activating')
  const [plan, setPlan] = useState<SubscriptionPlan>('free')
  const attemptsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const confirmCheckoutSession = useCallback(async (): Promise<void> => {
    if (!sessionId) return
    try {
      await fetch('/api/stripe/confirm-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
        cache: 'no-store',
      })
    } catch {
      // Transient — polling /api/user/me will keep trying.
    }
  }, [sessionId])

  const poll = useCallback(async () => {
    if (stoppedRef.current) return
    try {
      // Fallback when the webhook is slow or missing (e.g. local dev without stripe listen).
      await confirmCheckoutSession()

      const res = await fetch('/api/user/me', { cache: 'no-store' })
      if (res.ok) {
        const body = (await res.json()) as { subscription_plan?: string | null }
        const next = normalizeSubscriptionPlan(body.subscription_plan)
        if (isPaidUser(next)) {
          stoppedRef.current = true
          clearTimer()
          setPlan(next)
          setStatus('confirmed')
          return
        }
      }
    } catch {
      // Swallow transient errors and keep polling until the attempt cap.
    }

    attemptsRef.current += 1
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setStatus('timeout')
      return
    }
    timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
  }, [clearTimer, confirmCheckoutSession])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    stoppedRef.current = false
    attemptsRef.current = 0
    setStatus('activating')
    void poll()
    return () => {
      stoppedRef.current = true
      clearTimer()
    }
  }, [isLoaded, isSignedIn, poll, clearTimer])

  // Intentionally NO auto-redirect: the user may have upgraded from any page and
  // could arrive here without expecting it. We keep them on the thank-you screen
  // until they acknowledge it with the button below, which then lands them on the
  // dashboard (a safe home for brand-new users — /explore 500s without a resume).
  const retry = useCallback(() => {
    stoppedRef.current = false
    attemptsRef.current = 0
    setStatus('activating')
    void poll()
  }, [poll])

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 py-16 text-white">
      <div className="glass-card-strong relative w-full max-w-md rounded-3xl border border-white/10 p-10 text-center">
        <div className="mb-6 flex justify-center">
          {status === 'confirmed' ? (
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 ring-1 ring-inset ring-primary/30">
              <Image
                src={scoutLogo}
                alt="Scout"
                width={32}
                height={32}
                className="h-8 w-8 select-none object-contain"
              />
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary">
                <Check className="h-4 w-4 text-white" strokeWidth={3} />
              </span>
            </span>
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/10">
              <Loader2 className="h-7 w-7 animate-spin text-[#FF6733]" />
            </span>
          )}
        </div>

        {status === 'confirmed' ? (
          <>
            <h1 className="font-headline text-3xl font-medium tracking-[-0.02em] text-white">
              Welcome to {planDisplayLabel(plan)}
            </h1>
            <p className="mx-auto mt-3 max-w-sm font-body text-[15px] leading-relaxed text-[#A1A1AA]">
              Your plan is active. The full Scout Agent is unlocked — let&apos;s
              put it to work on your applications.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => router.push('/dashboard')}
              className="group mt-7 w-full"
            >
              Go to your dashboard
              <ArrowRight
                className="transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </Button>
          </>
        ) : status === 'timeout' ? (
          <>
            <h1 className="font-headline text-2xl font-medium tracking-[-0.02em] text-white">
              Almost there
            </h1>
            <p className="mx-auto mt-3 max-w-sm font-body text-[15px] leading-relaxed text-[#A1A1AA]">
              Payment received. Your plan is taking a moment to activate — this
              can happen if Stripe is still confirming. Try again in a few
              seconds.
            </p>
            <Button type="button" size="lg" onClick={retry} className="mt-7 w-full">
              Check again
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/dashboard')}
              className="mt-3"
            >
              Go to dashboard
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-headline text-2xl font-medium tracking-[-0.02em] text-white">
              Activating your plan…
            </h1>
            <p className="mx-auto mt-3 max-w-sm font-body text-[15px] leading-relaxed text-[#A1A1AA]">
              Thanks for upgrading. We&apos;re confirming your payment with
              Stripe — this only takes a moment.
            </p>
          </>
        )}

        <div className="mt-7 flex justify-center">
          <SecuredByStripe />
        </div>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeContent />
    </Suspense>
  )
}
