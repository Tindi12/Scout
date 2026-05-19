'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { scoutLogo } from '@/lib/scout-logo'

const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const

const navLinkClass =
  'font-label text-base font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white'

export function DynamicIsland() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
        <Link
          href="#top"
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

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={navLinkClass}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <Link href="/login" prefetch className={`hidden md:inline-flex ${navLinkClass}`}>
            Log In
          </Link>
          <Link
            href="/sign-up"
            prefetch
            className="font-label inline-flex items-center justify-center rounded-full bg-[#FF6733] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all duration-200 hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-95 sm:px-6"
          >
            Try Scout Now
          </Link>
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
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`block rounded-xl px-3 py-2.5 ${navLinkClass} hover:bg-white/[0.04]`}
                  onClick={closeMenu}
                >
                  {link.label}
                </Link>
              </li>
            ))}
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
