'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'

import {
  isPaidUser,
  normalizeSubscriptionPlan,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'

export type TierState = {
  /** Current plan once known; null while unknown / logged out. */
  plan: SubscriptionPlan | null
  isPaid: boolean
  isSignedIn: boolean
  /** True until Clerk + the first /api/user/me fetch settle. */
  loading: boolean
  error: string | null
  refetch: () => Promise<SubscriptionPlan | null>
}

/**
 * Single client-side read of the viewer's subscription tier. Combines Clerk auth
 * (logged-out vs logged-in) with the canonical plan from GET /api/user/me.
 * Shared by the pricing page, the gate helper, and the post-upgrade flow.
 */
export function useTier(): TierState {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async (): Promise<SubscriptionPlan | null> => {
    if (!authLoaded) return null
    if (!isSignedIn) {
      setPlan(null)
      setError(null)
      setLoading(false)
      return null
    }

    setLoading(true)
    try {
      const res = await fetch('/api/user/me', { cache: 'no-store' })
      if (!res.ok) {
        setError('Could not load your plan.')
        return null
      }
      const body = (await res.json()) as {
        subscription_plan?: string | null
      }
      const next = normalizeSubscriptionPlan(body.subscription_plan)
      setPlan(next)
      setError(null)
      return next
    } catch {
      setError('Could not load your plan.')
      return null
    } finally {
      setLoading(false)
    }
  }, [authLoaded, isSignedIn])

  useEffect(() => {
    void refetch()
    // user?.id ensures we re-read after sign-in/out within the same mount.
  }, [refetch, user?.id])

  return {
    plan,
    isPaid: plan ? isPaidUser(plan) : false,
    isSignedIn: Boolean(isSignedIn),
    loading: !authLoaded || loading,
    error,
    refetch,
  }
}
