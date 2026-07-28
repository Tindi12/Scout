'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'

const TABS = [
  { id: 'articles' as const, href: '/blog', label: 'Articles' },
  { id: 'changelog' as const, href: '/changelog', label: 'Changelog' },
] as const

/**
 * Articles / Changelog switcher using the shared Scout chip button pattern
 * (same selected-state treatment as PillGroup / profile chips).
 */
export function ContentTabs() {
  const pathname = usePathname()
  const active = pathname.startsWith('/changelog') ? 'changelog' : 'articles'

  return (
    <div
      className="mx-auto mt-8 flex max-w-3xl justify-center gap-2 px-6 sm:mt-10 lg:px-12"
      role="tablist"
      aria-label="Content sections"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <Button
            key={tab.id}
            asChild
            variant="chip"
            size="sm"
            data-state={isActive ? 'selected' : undefined}
          >
            <Link
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              prefetch
              scroll={false}
            >
              {tab.label}
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
