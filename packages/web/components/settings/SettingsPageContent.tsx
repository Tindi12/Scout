'use client'

import { AccountActionsSection } from '@/components/settings/AccountActionsSection'
import { AccountSection } from '@/components/settings/AccountSection'
import { BillingSection } from '@/components/settings/BillingSection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'

export function SettingsPageContent() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-headline text-2xl font-medium tracking-tight text-white md:text-3xl">
          Settings
        </h1>
        <p className="font-body text-sm text-[#A1A1AA]">
          Manage your account, billing, and notifications.
        </p>
      </header>

      <AccountSection />
      <BillingSection />
      <NotificationsSection />
      <AccountActionsSection />
    </div>
  )
}
