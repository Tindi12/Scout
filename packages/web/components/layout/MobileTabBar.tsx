'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Bot,
  Compass,
  FileText,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type Tab = {
  href: string
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/resume', label: 'Resume', icon: FileText },
  { href: '/explore', label: 'Jobs', icon: Compass },
  { href: '/tracker', label: 'Tracker', icon: Activity },
  { href: '/copilot', label: 'Copilot', icon: Bot },
]

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-md md:hidden"
      aria-label="Primary mobile"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = isActive(pathname, tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'group relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
              active ? 'text-white' : 'text-[#666]',
            )}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
              />
            ) : null}
            <Icon
              className={cn(
                'h-5 w-5 transition-colors',
                active ? 'text-[#FF6733]' : 'text-[#555] group-hover:text-[#888]',
              )}
              strokeWidth={1.75}
            />
            <span
              className={cn(
                'font-label text-[10px] font-medium tracking-wide',
                active ? 'text-white' : 'text-[#666]',
              )}
            >
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
