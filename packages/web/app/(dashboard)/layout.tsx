import { CopilotBubble } from '@/components/layout/CopilotBubble'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
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
    </div>
  )
}
