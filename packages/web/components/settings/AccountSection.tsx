'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import { User } from 'lucide-react'

import {
  SettingsReadOnlyRow,
  SettingsSection,
} from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function AccountSection() {
  const { user, isLoaded } = useUser()
  const { openUserProfile } = useClerk()

  const displayName =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.username ||
    ''
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    ''

  return (
    <SettingsSection
      title="Account"
      icon={User}
      description="Your sign-in identity and contact details."
    >
      {!isLoaded ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <SettingsReadOnlyRow label="Name" value={displayName} />
          <SettingsReadOnlyRow label="Email" value={email} />
          <p className="text-xs text-[#666]">
            Managed by our account provider, Clerk.
          </p>
          <Button type="button" variant="outline" onClick={() => openUserProfile()}>
            Manage account
          </Button>
        </>
      )}
    </SettingsSection>
  )
}
