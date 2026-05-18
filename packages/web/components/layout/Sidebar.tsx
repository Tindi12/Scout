'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Activity,
  Bot,
  Compass,
  FileText,
  LayoutDashboard,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ApplicationCreditsMeter } from '@/components/layout/ApplicationCreditsMeter'
import { scoutLogo } from '@/lib/scout-logo'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/resume', label: 'Resume', icon: FileText },
  { href: '/explore', label: 'Jobs', icon: Compass },
  { href: '/tracker', label: 'Tracker', icon: Activity },
  { href: '/copilot', label: 'Copilot', icon: Bot },
  { href: '/profile', label: 'Profile', icon: User },
]

const SETTINGS_ITEM: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: SettingsIcon,
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({
  item,
  active,
  showAlertDot,
}: {
  item: NavItem
  active: boolean
  showAlertDot?: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center gap-3 border-l-2 px-5 py-2.5 text-sm transition-colors duration-150',
        active
          ? 'border-[#FF6733] bg-[#FF6733]/5 text-white'
          : 'border-transparent text-[#666] hover:text-[#999]',
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          active ? 'text-[#FF6733]' : 'text-[#555] group-hover:text-[#888]',
        )}
        strokeWidth={1.75}
      />
      <span className="font-label font-medium">{item.label}</span>
      {showAlertDot && (
        <span
          aria-label="Profile incomplete"
          className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-[#FF6733] shadow-[0_0_8px_rgba(255,103,51,0.7)]"
        />
      )}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, isLoaded } = useUser()
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null)

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

    void (async () => {
      try {
        const response = await fetch('/api/user/me', { cache: 'no-store' })
        if (!response.ok) return
        const body = (await response.json()) as { profile_complete?: boolean }
        if (!cancelled) setProfileComplete(Boolean(body?.profile_complete))
      } catch {
        if (!cancelled) setProfileComplete(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const firstName =
    user?.firstName ?? user?.username ?? user?.fullName?.split(' ')[0] ?? 'You'
  const fullName = user?.fullName ?? firstName
  const initials =
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-white/[0.06] bg-[#0a0a0a] md:flex"
      aria-label="Primary"
    >
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
        <Image
          src={scoutLogo}
          alt="Scout"
          width={28}
          height={28}
          priority
          draggable={false}
          className="h-7 w-7 select-none object-contain"
        />
        <span className="font-headline text-lg font-semibold tracking-tight text-white">
          Scout
        </span>
      </div>

      <div className="mx-3 mb-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        {!isLoaded ? (
          <>
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </>
        ) : (
          <>
            <Avatar className="h-8 w-8">
              {user?.imageUrl ? (
                <AvatarImage src={user.imageUrl} alt={fullName} />
              ) : null}
              <AvatarFallback className="bg-[#FF6733]/15 text-[11px] font-medium text-[#FF6733]">
                {initials || firstName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-label text-[13px] font-medium text-white">
                {firstName}
              </div>
              <div className="mt-0.5">
                {isPro === null ? (
                  <Skeleton className="h-3 w-10" />
                ) : isPro ? (
                  <span className="inline-flex items-center rounded-full bg-[#FF6733]/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[#FF6733]">
                    Pro
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[#888]">
                    Free
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 py-2">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            showAlertDot={item.href === '/profile' && profileComplete === false}
          />
        ))}
      </nav>

      <div className="space-y-3 pb-5 pt-2">
        <NavLink
          item={SETTINGS_ITEM}
          active={isActive(pathname, SETTINGS_ITEM.href)}
        />

        <div className="px-4">
          <ApplicationCreditsMeter />
        </div>

        <div className="px-5 pt-1 text-center">
          <span className="font-label text-[10px] uppercase tracking-[0.2em] text-[#333]">
            v1.0
          </span>
        </div>
      </div>
    </aside>
  )
}
