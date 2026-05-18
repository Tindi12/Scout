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

import { supabase } from '@/lib/supabase'

export const FREE_APPLICATION_LIMIT = 25
export const PRO_APPLICATION_LIMIT = 200

export type ExploreBatchState = {
  selectedCount: number
  isSending: boolean
  onSend: () => void
}

export type ApplicationCredits = {
  remaining: number
  limit: number
  used: number
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
      let isPro = false
      let supabaseUserId: string | null = null

      if (meRes.ok) {
        const body = (await meRes.json()) as {
          id?: string | null
          is_pro?: boolean | null
        }
        isPro = Boolean(body.is_pro)
        supabaseUserId = body.id ?? null
      }

      let used = 0
      if (supabaseUserId) {
        const { count, error } = await supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', supabaseUserId)
        if (!error && typeof count === 'number') used = count
      }

      const limit = isPro ? PRO_APPLICATION_LIMIT : FREE_APPLICATION_LIMIT
      setCredits({
        remaining: Math.max(0, limit - used),
        limit,
        used,
        isPro,
      })
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
