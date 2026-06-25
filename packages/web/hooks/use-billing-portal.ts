'use client'

import { useCallback, useState } from 'react'

import { createPortalUrl } from '@/lib/billing'

/**
 * Shared Stripe billing-portal redirect logic. Used by ManageBillingButton and
 * the profile dropdown so portal triggering lives in one place.
 */
export function useBillingPortal() {
  const [loading, setLoading] = useState(false)

  const openPortal = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      window.location.href = await createPortalUrl()
    } catch (err) {
      setLoading(false)
      throw err
    }
  }, [loading])

  return { openPortal, loading }
}
