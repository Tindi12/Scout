'use client'

import { CreditCard } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { ManageBillingButton } from '@/components/billing/ManageBillingButton'
import { SecuredByStripe } from '@/components/billing/SecuredByStripe'
import {
  SettingsReadOnlyRow,
  SettingsSection,
} from '@/components/settings/SettingsSection'
import { Skeleton } from '@/components/ui/skeleton'
import { useTier } from '@/hooks/use-tier'
import type { ApplicationCreditsSnapshot } from '@/lib/application-credits'
import { creditsPeriodLabel, planDisplayLabel } from '@/lib/subscription-plan'

const UPGRADE_LINK_CLASS =
  'inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-medium text-[#bbb] transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white active:scale-[0.97]'

export function BillingSection() {
  const { plan, isPaid, loading } = useTier()
  const [credits, setCredits] = useState<ApplicationCreditsSnapshot | null>(
    null,
  )

  useEffect(() => {
    if (loading) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const body = (await res.json()) as {
          application_credits?: ApplicationCreditsSnapshot
        }
        if (!cancelled && body.application_credits) {
          setCredits(body.application_credits)
        }
      } catch {
        // credits line is optional
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading])

  return (
    <SettingsSection
      title="Subscription & Billing"
      icon={CreditCard}
      description="Your plan, application limits, and payment settings."
    >
      {loading || plan === null ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <SettingsReadOnlyRow
            label="Current plan"
            value={planDisplayLabel(plan)}
          />
          {credits ? (
            <SettingsReadOnlyRow
              label="Applications"
              value={`${credits.remaining} of ${credits.limit} remaining ${creditsPeriodLabel(plan)}`}
            />
          ) : null}

          <div className="border-t border-white/[0.06] pt-4">
            <div className="flex flex-col items-start gap-3">
              {isPaid ? (
                <ManageBillingButton variant="secondary" />
              ) : (
                <Link href="/pricing" className={UPGRADE_LINK_CLASS}>
                  Upgrade
                </Link>
              )}
              <SecuredByStripe />
            </div>
          </div>
        </>
      )}
    </SettingsSection>
  )
}
