'use client'

import { useUser } from '@clerk/nextjs'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { ApplicationCreditsSnapshot } from '@/lib/application-credits'
import {
  FREE_APPLICATION_LIMIT,
  PRO_APPLICATION_LIMIT,
  SCOUT_PLUS_APPLICATION_LIMIT,
} from '@/lib/subscription-plan'

export {
  FREE_APPLICATION_LIMIT,
  PRO_APPLICATION_LIMIT,
  SCOUT_PLUS_APPLICATION_LIMIT,
}

export type ExploreBatchState = {
  selectedCount: number
  isSending: boolean
  onSend: () => void
}

export type ApplicationCredits = ApplicationCreditsSnapshot & {
  /** @deprecated Use isPaid — kept for callers that check isPro */
  isPro: boolean
}

type ExploreBatchContextValue = {
  batch: ExploreBatchState | null
  setBatch: (batch: ExploreBatchState | null) => void
  pulseNonce: number
  requestPulse: () => void
  credits: ApplicationCredits | null
  creditsLoading: boolean
  refreshCredits: () => Promise<void>
}

const ExploreBatchContext = createContext<ExploreBatchContextValue | null>(
  null,
)

export function ExploreBatchProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const [batch, setBatch] = useState<ExploreBatchState | null>(null)
  const [pulseNonce, setPulseNonce] = useState(0)
  const [credits, setCredits] = useState<ApplicationCredits | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(true)

  const requestPulse = useCallback(() => {
    setPulseNonce((n) => n + 1)
  }, [])

  const refreshCredits = useCallback(async () => {
    if (!user?.id) {
      setCredits(null)
      setCreditsLoading(false)
      return
    }

    setCreditsLoading(true)
    try {
      const meRes = await fetch('/api/user/me', { cache: 'no-store' })
      if (!meRes.ok) {
        setCredits(null)
        return
      }
      const body = (await meRes.json()) as {
        application_credits?: ApplicationCreditsSnapshot | null
      }
      const snapshot = body.application_credits
      if (snapshot) {
        setCredits({
          ...snapshot,
          isPro: snapshot.isPaid,
        })
      } else {
        setCredits(null)
      }
    } catch {
      setCredits(null)
    } finally {
      setCreditsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void refreshCredits()
  }, [refreshCredits])

  const value = useMemo(
    () => ({
      batch,
      setBatch,
      pulseNonce,
      requestPulse,
      credits,
      creditsLoading,
      refreshCredits,
    }),
    [batch, pulseNonce, requestPulse, credits, creditsLoading, refreshCredits],
  )

  return (
    <ExploreBatchContext.Provider value={value}>
      {children}
    </ExploreBatchContext.Provider>
  )
}

export function useExploreBatch() {
  const ctx = useContext(ExploreBatchContext)
  if (!ctx) {
    throw new Error('useExploreBatch must be used within ExploreBatchProvider')
  }
  return ctx
}

/** Safe for TopBar / Sidebar outside Explore page setup. */
export function useExploreBatchOptional() {
  return useContext(ExploreBatchContext)
}
