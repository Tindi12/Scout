'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { scoutLogo } from '@/lib/scout-logo'

const NAV_SECTIONS = [
  { hash: '#about', label: 'About' },
  { hash: '#pricing', label: 'Pricing' },
  { hash: '#faq', label: 'FAQ' },
] as const

const navLinkClass =
  'font-label text-base font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white'

function landingNavHref(pathname: string, hash: string): string {
  return pathname === '/' ? hash : `/${hash}`
}

export function DynamicIsland() {
  const pathname = usePathname()
  const isLanding = pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = useMemo(
    () =>
      NAV_SECTIONS.map((link) => ({
        ...link,
        href: landingNavHref(pathname, link.hash),
      })),
    [pathname],
  )

  const homeHref = isLanding ? '#top' : '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-6 z-50 flex flex-col items-center gap-2 px-4">
      <nav
        className={`glass-pill pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-full py-3 pl-4 pr-3 transition-shadow duration-300 sm:gap-6 ${
          scrolled ? 'shadow-[0_10px_40px_rgba(0,0,0,0.6)]' : ''
        }`}
      >
        <div className="flex min-w-0 shrink items-center gap-3">
          <Link
            href={homeHref}
            className="group flex shrink-0 items-center gap-2.5 transition-all duration-300"
            aria-label="Scout home"
          >
            <Image
              src={scoutLogo}
              alt="Scout AI Logo"
              width={32}
              height={32}
              priority
              draggable={false}
              className="h-8 w-8 select-none object-contain opacity-90 transition-all duration-300 group-hover:scale-[1.04] group-hover:opacity-100"
            />
            <span className="font-headline text-lg font-semibold tracking-tight text-white">
              Scout
            </span>
          </Link>

          {!isLanding ? (
            <Link
              href="/"
              className="font-label hidden items-center gap-1 text-sm font-medium text-[#888] transition-colors duration-200 hover:text-white sm:inline-flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Back to home
            </Link>
          ) : null}
        </div>

        {isLanding ? (
          <ul className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <li key={link.hash}>
                <Link href={link.href} className={navLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <Link href="/login" prefetch className={`hidden md:inline-flex ${navLinkClass}`}>
            Log In
          </Link>
          <Button asChild>
            <Link href="/sign-up" prefetch>
              Try Scout Now
            </Link>
          </Button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#A1A1AA] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white md:hidden"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <nav
          id="landing-mobile-nav"
          className="glass-pill pointer-events-auto w-full max-w-3xl rounded-3xl p-4 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {!isLanding ? (
              <li>
                <Link
                  href="/"
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${navLinkClass} hover:bg-white/[0.04]`}
                  onClick={closeMenu}
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Back to home
                </Link>
              </li>
            ) : null}
            {isLanding
              ? navLinks.map((link) => (
                  <li key={link.hash}>
                    <Link
                      href={link.href}
                      className={`block rounded-xl px-3 py-2.5 ${navLinkClass} hover:bg-white/[0.04]`}
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))
              : null}
            <li>
              <Link
                href="/login"
                prefetch
                className={`block rounded-xl px-3 py-2.5 ${navLinkClass} hover:bg-white/[0.04]`}
                onClick={closeMenu}
              >
                Log In
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
