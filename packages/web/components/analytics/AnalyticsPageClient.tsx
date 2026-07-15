'use client'

import { RequiresPaid } from '@/components/billing/RequiresPaid'

import { MissionControlScene } from './MissionControlScene'

export function AnalyticsPageClient() {
  return (
    <RequiresPaid
      requiredTier="scout_plus"
      title="Advanced analytics is Scout+"
      description="Upgrade to Scout+ to get early access to Analytics when it launches."
    >
      <MissionControlScene />
    </RequiresPaid>
  )
}
