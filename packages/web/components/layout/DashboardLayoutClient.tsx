'use client'

import { Suspense } from 'react'

import { CopilotBubble } from '@/components/layout/CopilotBubble'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MailOAuthReturnSync } from '@/components/settings/MailOAuthReturnSync'
import { Toaster } from '@/components/ui/toaster'
import { ExploreBatchProvider } from '@/contexts/explore-batch-context'
import { NotificationsProvider } from '@/contexts/notifications-context'
import { UpgradeGateProvider } from '@/contexts/upgrade-gate-context'

export function DashboardLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ExploreBatchProvider>
      <UpgradeGateProvider>
        <NotificationsProvider>
          <Suspense fallback={null}>
            <MailOAuthReturnSync />
          </Suspense>
          <div className="min-h-screen bg-[#080808] text-white">
            <Sidebar />
            <div className="md:pl-[220px]">
              <TopBar />
              <main className="px-5 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6">
                {children}
              </main>
            </div>
            <MobileTabBar />
            <CopilotBubble />
            <Toaster />
          </div>
        </NotificationsProvider>
      </UpgradeGateProvider>
    </ExploreBatchProvider>
  )
}
