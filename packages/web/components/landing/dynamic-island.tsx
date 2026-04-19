'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const

export function DynamicIsland() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
      <nav
        className={`glass-pill pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-6 rounded-full pl-3 pr-2 py-2 transition-shadow duration-300 ${
          scrolled ? 'shadow-[0_10px_40px_rgba(0,0,0,0.6)]' : ''
        }`}
      >
        <Link
          href="#top"
          className="group flex items-center gap-2 pl-1 transition-all duration-300"
          aria-label="Scout home"
        >
          <Image
            src="/scout-logo.png"
            alt="Scout AI Logo"
            width={28}
            height={28}
            priority
            draggable={false}
            className="h-7 w-7 select-none object-contain opacity-90 transition-all duration-300 group-hover:scale-[1.04] group-hover:opacity-100"
          />
          <span className="font-headline text-base font-semibold tracking-tight text-white">
            Scout
          </span>
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="font-label text-[14px] font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/sign-up"
          prefetch
          className="font-label inline-flex items-center justify-center rounded-full bg-[#FF6733] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all duration-200 hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-95"
        >
          Try Scout Now
        </Link>
      </nav>
    </header>
  )
}
