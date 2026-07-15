'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { LandingHashLink } from '@/components/landing/landing-hash-link'
import { Button } from '@/components/ui/button'
import { scoutLogo } from '@/lib/scout-logo'

const NAV_SECTIONS = [
  { hash: '#about', label: 'About' },
  { hash: '#pricing', label: 'Pricing' },
  { hash: '#faq', label: 'FAQ' },
] as const

/** Scroll distance (px) over which the flat bar morphs into the glass pill. */
const NAV_MORPH_RANGE = 96

const navLinkClass =
  'font-label text-base font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white'

function landingNavHref(pathname: string, hash: string): string {
  return pathname === '/' ? hash : `/${hash}`
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function DynamicIsland() {
  const pathname = usePathname()
  const isLanding = pathname === '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const progressRef = useRef(0)
  const rafRef = useRef(0)

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
    const applyProgress = (progress: number) => {
      const next = Math.round(progress * 1000) / 1000
      if (Math.abs(next - progressRef.current) < 0.001) return
      progressRef.current = next
      headerRef.current?.style.setProperty('--nav-progress', String(next))
    }

    const update = () => {
      rafRef.current = 0
      applyProgress(clamp01(window.scrollY / NAV_MORPH_RANGE))
    }

    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
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
    <header
      ref={headerRef}
      className="landing-nav-header pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2"
      style={{ ['--nav-progress' as string]: 0 }}
    >
      <div className="relative w-full">
        <div className="landing-nav-pad w-full">
          <div className="landing-nav-shell pointer-events-auto relative mx-auto w-full">
            <nav
              className="landing-nav flex w-full items-center justify-between gap-4 sm:gap-6"
              aria-label="Primary"
            >
              <div className="flex min-w-0 shrink items-center gap-3">
                {isLanding ? (
                  <LandingHashLink
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
                  </LandingHashLink>
                ) : (
                  <Link
                    href="/"
                    className="group font-label inline-flex items-center gap-2.5 text-sm font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white"
                    aria-label="Back to home"
                  >
                    <Image
                      src={scoutLogo}
                      alt=""
                      width={32}
                      height={32}
                      priority
                      draggable={false}
                      className="h-8 w-8 select-none object-contain opacity-90 transition-all duration-300 group-hover:scale-[1.04] group-hover:opacity-100"
                    />
                    <span className="inline-flex items-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      Back to home
                    </span>
                  </Link>
                )}
              </div>

              {isLanding ? (
                <ul className="hidden items-center gap-8 md:flex">
                  {navLinks.map((link) => (
                    <li key={link.hash}>
                      <LandingHashLink href={link.href} className={navLinkClass}>
                        {link.label}
                      </LandingHashLink>
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
          </div>
        </div>

        {/* Locked to page gutters — independent of the pill shrink. */}
        <div aria-hidden className="landing-nav-divider absolute top-full">
          <div className="frame-divider relative mx-auto max-w-7xl">
            <span className="frame-corner" style={{ left: 0 }} />
            <span className="frame-corner" style={{ left: '100%' }} />
            <span
              className="frame-corner frame-corner-outer"
              style={{ left: 'calc(-1 * var(--landing-frame-gap))' }}
            />
            <span
              className="frame-corner frame-corner-outer"
              style={{ left: 'calc(100% + var(--landing-frame-gap))' }}
            />
          </div>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="landing-mobile-nav"
          className="glass-pill pointer-events-auto w-full max-w-3xl rounded-3xl p-4 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {isLanding
              ? navLinks.map((link) => (
                  <li key={link.hash}>
                    <LandingHashLink
                      href={link.href}
                      className={`block rounded-xl px-3 py-2.5 ${navLinkClass} hover:bg-white/[0.04]`}
                      onClick={closeMenu}
                    >
                      {link.label}
                    </LandingHashLink>
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
