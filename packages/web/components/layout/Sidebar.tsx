'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import {
  Activity,
  BarChart3,
  Bot,
  ChevronDown,
  Compass,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { PlanBadge } from '@/components/billing/PlanBadge'
import { ApplicationCreditsMeter } from '@/components/layout/ApplicationCreditsMeter'
import { scoutLogo } from '@/lib/scout-logo'
import {
  normalizeSubscriptionPlan,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'
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
]

const PROFILE_ITEM: NavItem = { href: '/profile', label: 'Profile', icon: User }

const SCOUT_PLUS_NAV: NavItem = {
  href: '/analytics',
  label: 'Analytics',
  icon: BarChart3,
}

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
        'group relative mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
        active
          ? 'bg-[#1c1c1c] text-white'
          : 'text-[#888] hover:bg-[#1c1c1c] hover:text-white',
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          active
            ? 'text-[#FF6733]'
            : 'text-[#888] group-hover:text-[#FF6733]',
        )}
        strokeWidth={1.75}
      />
      <span className="font-label font-medium">{item.label}</span>
      {showAlertDot && (
        <span
          aria-label="Profile incomplete"
          className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-primary"
        />
      )}
    </Link>
  )
}

function SidebarProfileMenu({
  isLoaded,
  firstName,
  fullName,
  initials,
  imageUrl,
  plan,
  planLoading,
}: {
  isLoaded: boolean
  firstName: string
  fullName: string
  initials: string
  imageUrl?: string | null
  plan: SubscriptionPlan | null
  planLoading: boolean
}) {
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, closeMenu])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open, closeMenu])

  const handleSignOut = () => {
    setSigningOut(true)
    void signOut({ redirectUrl: '/' })
  }

  return (
    <div ref={menuRef} className="relative mx-3 mb-4">
      <button
        type="button"
        disabled={!isLoaded}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-colors duration-150',
          'hover:border-white/[0.1] hover:bg-white/[0.05]',
          open && 'border-white/[0.1] bg-white/[0.05]',
        )}
      >
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
              {imageUrl ? (
                <AvatarImage src={imageUrl} alt={fullName} />
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
                {planLoading || plan === null ? (
                  <Skeleton className="h-3 w-10" />
                ) : (
                  <PlanBadge plan={plan} />
                )}
              </div>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-[#555] transition-transform duration-200',
                open && 'rotate-180 text-[#888]',
              )}
              strokeWidth={1.75}
              aria-hidden
            />
          </>
        )}
      </button>

      {open && isLoaded ? (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111111] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={handleSignOut}
            className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.05] disabled:opacity-60"
          >
            <LogOut
              className="h-[18px] w-[18px] shrink-0 text-[#555] transition-colors group-hover:text-[#FF6733]"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="font-label text-sm font-medium text-[#999] transition-colors group-hover:text-white">
              {signingOut ? 'Signing out…' : 'Log Out'}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, isLoaded } = useUser()
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!user?.id) {
      setPlan(null)
      setPlanLoading(false)
      return
    }

    setPlanLoading(true)
    void (async () => {
      try {
        const response = await fetch('/api/user/me', { cache: 'no-store' })
        if (!response.ok) {
          if (!cancelled) setPlan('free')
          return
        }
        const body = (await response.json()) as {
          profile_complete?: boolean
          subscription_plan?: SubscriptionPlan | string | null
        }
        if (!cancelled) {
          setPlan(normalizeSubscriptionPlan(body.subscription_plan))
          setProfileComplete(Boolean(body.profile_complete))
        }
      } catch {
        if (!cancelled) {
          setPlan('free')
          setProfileComplete(null)
        }
      } finally {
        if (!cancelled) setPlanLoading(false)
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
      <Link
        href="/"
        className="group flex items-center gap-2.5 px-5 pb-4 pt-6 transition-opacity hover:opacity-90"
        aria-label="Scout home"
      >
        <Image
          src={scoutLogo}
          alt=""
          width={28}
          height={28}
          priority
          draggable={false}
          className="h-7 w-7 select-none object-contain transition-transform duration-200 group-hover:scale-[1.03]"
        />
        <span className="font-headline text-lg font-semibold tracking-tight text-white">
          Scout
        </span>
      </Link>

      <SidebarProfileMenu
        isLoaded={isLoaded}
        firstName={firstName}
        fullName={fullName}
        initials={initials}
        imageUrl={user?.imageUrl}
        plan={plan}
        planLoading={planLoading}
      />

      <nav className="flex-1 space-y-0.5 py-2">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}
        {!planLoading && plan === 'scout_plus' ? (
          <NavLink
            item={SCOUT_PLUS_NAV}
            active={isActive(pathname, SCOUT_PLUS_NAV.href)}
          />
        ) : null}
      </nav>

      <div className="space-y-3 pb-5 pt-2">
        <div aria-hidden className="mx-6 h-px bg-white/[0.07]" />

        <div className="space-y-0.5">
          <NavLink
            item={PROFILE_ITEM}
            active={isActive(pathname, PROFILE_ITEM.href)}
            showAlertDot={profileComplete === false}
          />
          <NavLink
            item={SETTINGS_ITEM}
            active={isActive(pathname, SETTINGS_ITEM.href)}
          />
        </div>

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
