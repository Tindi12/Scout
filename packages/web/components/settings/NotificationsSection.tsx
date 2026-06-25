'use client'

import { Bell } from 'lucide-react'

import { Toggle } from '@/components/profile/Toggle'
import { SettingsSection } from '@/components/settings/SettingsSection'

export function NotificationsSection() {
  return (
    <SettingsSection
      title="Notifications"
      icon={Bell}
      description="Choose how Scout reaches you when it needs your input."
      badge="coming-soon"
    >
      <Toggle
        id="notify-input"
        label="Notify when Scout needs my input"
        description="Get alerted when an application requires your answer."
        checked={false}
        onChange={() => {}}
        disabled
      />
      <Toggle
        id="notify-updates"
        label="Email me application updates"
        description="Status changes and weekly summaries for your applications."
        checked={false}
        onChange={() => {}}
        disabled
      />
      <p className="text-xs text-[#666]">
        Notification preferences are coming soon.
      </p>
    </SettingsSection>
  )
}
