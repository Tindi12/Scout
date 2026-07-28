'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { LandingHashLink } from '@/components/landing/landing-hash-link'
import { ComingSoonCta } from '@/components/landing/waitlist'
import { Button } from '@/components/ui/button'
import { scoutLogo } from '@/lib/scout-logo'
import { isWaitlistMode } from '@/lib/waitlist-mode'

const NAV_LINKS = [
  { hash: '#about', label: 'About', kind: 'hash' as const },
  { hash: '#pricing', label: 'Pricing', kind: 'hash' as const },
  { href: '/faq', label: 'FAQ', kind: 'route' as const },
  { href: '/blog', label: 'Blog', kind: 'route' as const },
] as const

/** Mobile marketing menu: Home + dedicated pages only (no desktop section hashes). */
const MOBILE_MARKETING_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQ' },
] as const

/** Scroll distance (px) over which the flat bar morphs into the glass pill. */
const NAV_MORPH_RANGE = 96
/** Approx banner height so fixed nav sits below it before the first measure. */
const BANNER_CLEARANCE_FALLBACK = '2.5rem'

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
  const waitlist = isWaitlistMode()
  const isLanding = pathname === '/'
  const isMarketingChrome =
    isLanding ||
    pathname === '/pricing' ||
    pathname === '/blog' ||
    pathname.startsWith('/blog/') ||
    pathname === '/changelog' ||
    pathname === '/faq'
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const progressRef = useRef(0)
  const clearanceRef = useRef(0)
  const rafRef = useRef(0)

  const navLinks = useMemo(
    () =>
      NAV_LINKS.map((link) =>
        link.kind === 'hash'
          ? {
              key: link.hash,
              label: link.label,
              href: landingNavHref(pathname, link.hash),
              kind: 'hash' as const,
            }
          : {
              key: link.href,
              label: link.label,
              href: link.href,
              kind: 'route' as const,
            },
      ),
    [pathname],
  )

  const homeHref = isLanding ? '#top' : '/'

  useLayoutEffect(() => {
    const applyProgress = (progress: number) => {
      const next = Math.round(progress * 1000) / 1000
      if (Math.abs(next - progressRef.current) < 0.001) return
      progressRef.current = next
      headerRef.current?.style.setProperty('--nav-progress', String(next))
    }

    const applyBannerClearance = () => {
      if (!isLanding) {
        if (clearanceRef.current !== 0) {
          clearanceRef.current = 0
          headerRef.current?.style.setProperty('--banner-clearance', '0px')
        }
        return
      }
      const banner = document.getElementById('announcement-banner')
      if (!banner) {
        if (clearanceRef.current !== 0) {
          clearanceRef.current = 0
          headerRef.current?.style.setProperty('--banner-clearance', '0px')
        }
        return
      }
      const rect = banner.getBoundingClientRect()
      const remaining = Math.max(0, Math.min(rect.height, rect.bottom))
      const next = Math.round(remaining)
      if (next === clearanceRef.current) return
      clearanceRef.current = next
      headerRef.current?.style.setProperty('--banner-clearance', `${next}px`)
    }

    const update = () => {
      rafRef.current = 0
      applyProgress(clamp01(window.scrollY / NAV_MORPH_RANGE))
      applyBannerClearance()
    }

    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [isLanding])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header
      ref={headerRef}
      className="landing-nav-header pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2"
      style={
        {
          ['--nav-progress' as string]: 0,
          ['--banner-clearance' as string]: isLanding
            ? BANNER_CLEARANCE_FALLBACK
            : '0px',
        } as CSSProperties
      }
    >
      <div className="relative w-full">
        <div className="landing-nav-pad w-full">
          <div className="landing-nav-shell pointer-events-auto relative mx-auto w-full">
            <nav
              className="landing-nav flex w-full items-center justify-between gap-4 sm:gap-6"
              aria-label="Primary"
            >
              <div className="flex min-w-0 shrink items-center gap-3">
                {isMarketingChrome ? (
                  isLanding ? (
                    <LandingHashLink
                      href={homeHref}
                      className="group flex min-h-11 shrink-0 items-center gap-2 transition-all duration-300 sm:gap-2.5"
                      aria-label="Scout home"
                    >
                      <Image
                        src={scoutLogo}
                        alt="Scout AI Logo"
                        width={28}
                        height={28}
                        priority
                        draggable={false}
                        className="h-7 w-7 select-none object-contain opacity-90 transition-all duration-300 group-hover:scale-[1.04] group-hover:opacity-100 sm:h-8 sm:w-8"
                      />
                      <span className="font-headline text-base font-semibold tracking-tight text-white sm:text-lg">
                        Scout
                      </span>
                    </LandingHashLink>
                  ) : (
                    <Link
                      href="/"
                      className="group flex min-h-11 shrink-0 items-center gap-2 sm:gap-2.5 transition-all duration-300"
                      aria-label="Scout home"
                    >
                      <Image
                        src={scoutLogo}
                        alt="Scout AI Logo"
                        width={28}
                        height={28}
                        priority
                        draggable={false}
                        className="h-7 w-7 select-none object-contain opacity-90 transition-all duration-300 group-hover:scale-[1.04] group-hover:opacity-100 sm:h-8 sm:w-8"
                      />
                      <span className="font-headline text-base font-semibold tracking-tight text-white sm:text-lg">
                        Scout
                      </span>
                    </Link>
                  )
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

              {isMarketingChrome ? (
                <ul className="hidden items-center gap-8 md:flex">
                  {navLinks.map((link) => (
                    <li key={link.key}>
                      {link.kind === 'hash' ? (
                        <LandingHashLink href={link.href} className={navLinkClass}>
                          {link.label}
                        </LandingHashLink>
                      ) : (
                        <Link
                          href={link.href}
                          className={`${navLinkClass}${
                            pathname === link.href || pathname.startsWith(`${link.href}/`)
                              ? ' text-white'
                              : ''
                          }`}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                {waitlist ? (
                  /* Desktop/tablet only — phones use the hero waitlist form. */
                  <ComingSoonCta
                    source="nav"
                    size="default"
                    className="hidden min-h-10 sm:inline-flex"
                  />
                ) : (
                  <>
                    <Link
                      href="/login"
                      prefetch
                      className={`hidden md:inline-flex ${navLinkClass}`}
                    >
                      Log In
                    </Link>
                    <Button asChild className="hidden min-h-10 sm:inline-flex">
                      <Link href="/sign-up" prefetch>
                        Try Scout Now
                      </Link>
                    </Button>
                  </>
                )}
                {/* Mobile menu — landing + other marketing pages. */}
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#A1A1AA] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white md:hidden"
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
          className="glass-pill pointer-events-auto mx-2 w-[calc(100%-1rem)] max-w-3xl rounded-2xl p-2 md:hidden sm:mx-4 sm:rounded-3xl sm:p-3"
          aria-label="Mobile"
        >
          <ul className="flex flex-col gap-0.5">
            {isMarketingChrome
              ? MOBILE_MARKETING_LINKS.map((link) => {
                  const isActive =
                    link.href === '/'
                      ? pathname === '/'
                      : pathname === link.href ||
                        pathname.startsWith(`${link.href}/`)
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={`flex min-h-11 items-center rounded-xl px-3.5 py-2.5 text-sm sm:min-h-12 sm:px-4 sm:py-3 sm:text-base ${navLinkClass} hover:bg-white/[0.04]${
                          isActive ? ' text-white' : ''
                        }`}
                        onClick={closeMenu}
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                })
              : null}
            {waitlist ? (
              <li className="mt-1 border-t border-white/[0.06] pt-2">
                <ComingSoonCta
                  source="nav_mobile_cta"
                  label="Join waitlist"
                  className="min-h-11 w-full sm:min-h-12"
                  onOpen={closeMenu}
                />
              </li>
            ) : (
              <>
                <li>
                  <Link
                    href="/login"
                    prefetch
                    className={`flex min-h-11 items-center rounded-xl px-3.5 py-2.5 text-sm sm:min-h-12 sm:px-4 sm:py-3 sm:text-base ${navLinkClass} hover:bg-white/[0.04]`}
                    onClick={closeMenu}
                  >
                    Log In
                  </Link>
                </li>
                <li className="mt-1 border-t border-white/[0.06] pt-2 sm:hidden">
                  <Button asChild className="min-h-11 w-full sm:min-h-12">
                    <Link href="/sign-up" prefetch onClick={closeMenu}>
                      Try Scout Now
                    </Link>
                  </Button>
                </li>
              </>
            )}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
