'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Bell } from 'lucide-react'

import { SendScoutButton } from '@/components/layout/SendScoutButton'
import { supabase } from '@/lib/supabase'

function buildBreadcrumb(pathname: string | null): string[] {
  if (!pathname) return ['SCOUT']
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return ['SCOUT']
  return ['SCOUT', ...parts.map((p) => p.replace(/-/g, ' ').toUpperCase())]
}

export function TopBar() {
  const pathname = usePathname()
  const crumbs = useMemo(() => buildBreadcrumb(pathname), [pathname])
  const { user } = useUser()
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!user?.id) return

    void (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('is_pro')
          .eq('clerk_id', user.id)
          .maybeSingle()
        if (!cancelled) setIsPro(Boolean(data?.is_pro))
      } catch {
        if (!cancelled) setIsPro(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // No notifications API yet; placeholder always 0.
  const unreadCount = 0

  return (
    <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-white/[0.06] bg-[#080808]/80 px-5 backdrop-blur-md md:px-8">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#444]">
          {crumbs.map((crumb, i) => (
            <li key={`${crumb}-${i}`} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-[#2a2a2a]">/</span> : null}
              <span
                className={
                  i === crumbs.length - 1 ? 'text-[#666]' : 'text-[#444]'
                }
              >
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-[#888] transition-colors hover:border-white/[0.12] hover:text-white"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FF6733] shadow-[0_0_8px_rgba(255,103,51,0.7)]"
            />
          ) : null}
        </button>

        <SendScoutButton variant="topbar" isPro={isPro} />
      </div>
    </div>
  )
}
