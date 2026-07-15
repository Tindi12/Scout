'use client'

import { Bell } from 'lucide-react'

export function NotificationWidget() {
  return (
    <div className="flex h-full items-start gap-2.5 p-3">
      <Bell className="h-4 w-4 shrink-0 text-[#666]" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="font-body text-[10px] text-[#888]">New match alert</p>
        <span className="mt-1 inline-block h-1.5 w-12 rounded bg-white/[0.04]" />
      </div>
    </div>
  )
}
