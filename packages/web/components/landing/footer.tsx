import Image from 'next/image'
import Link from 'next/link'

import { scoutLogo } from '@/lib/scout-logo'
import { Instagram, Twitter } from 'lucide-react'

type SocialIconProps = { className?: string; strokeWidth?: number }

function TikTokIcon({ className, strokeWidth = 1.75 }: SocialIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  )
}

const COLUMNS = [
  {
    heading: 'Navigation',
    links: [
      { label: 'About', href: '#about' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { label: 'Resume', href: '/resume' },
      { label: 'Roles', href: '/roles' },
      { label: 'Tracker', href: '/tracker' },
      { label: 'Copilot', href: '/copilot' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Sign in', href: '/sign-in' },
      { label: 'Sign up', href: '/sign-up' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
] as const

export function Footer() {
  return (
    <footer className="relative px-6 pb-10 pt-24 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="glass-card relative overflow-hidden rounded-3xl p-10 md:p-14">
          <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
                Newsletter
              </p>
              <h3 className="mt-3 font-headline text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
                Stay in the loop.
              </h3>
              <p className="mt-3 font-body text-[15px] text-[#A1A1AA]">
                Tactical updates on landing internships, plus product news from
                the Scout team.
              </p>
            </div>

            <form
              className="relative flex w-full items-center"
              action="#"
              method="post"
            >
              <input
                type="email"
                placeholder="you@university.edu"
                aria-label="Email address"
                className="font-body w-full rounded-full border border-white/10 bg-white/[0.03] px-6 py-4 pr-36 text-[14.5px] text-white placeholder:text-[#888888] backdrop-blur-md transition-all duration-200 focus:border-[#FF6733]/60 focus:shadow-[0_0_24px_rgba(255,103,51,0.2)] focus:outline-none"
              />
              <button
                type="submit"
                className="font-label absolute right-1.5 inline-flex items-center justify-center rounded-full bg-[#FF6733] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_20px_rgba(255,103,51,0.35)] transition-all duration-200 hover:shadow-[0_0_30px_rgba(255,103,51,0.55)] active:scale-95"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="origin-left">
            <Link href="#top" className="inline-flex items-center gap-3">
              <Image
                src={scoutLogo}
                alt="Scout AI Logo"
                width={48}
                height={48}
                draggable={false}
                className="h-12 w-12 select-none object-contain"
              />
              <span className="font-headline text-2xl font-semibold tracking-tight text-white">
                Scout
              </span>
            </Link>
            <p className="mt-5 max-w-xs font-body text-sm leading-relaxed text-[#A1A1AA]">
              Built for the alchemist. Automating the internship hunt for the
              next generation of engineers.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#888888]">
                {col.heading}
              </h4>
              <ul className="mt-6 space-y-4">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="font-body inline-block text-[15px] text-[#A1A1AA] transition-all duration-200 hover:translate-x-0.5 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/5 pt-8 md:flex-row">
          <p className="font-label text-[11px] uppercase tracking-[0.2em] text-[#888888]">
            © {new Date().getFullYear()} Scout. Never Apply Again
          </p>
          <div className="flex items-center gap-5">
            {[
              { Icon: TikTokIcon, label: 'TikTok', href: '#' },
              { Icon: Twitter, label: 'Twitter', href: '#' },
              { Icon: Instagram, label: 'Instagram', href: '#' },
            ].map(({ Icon, label, href }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="text-[#888888] opacity-50 grayscale transition-all duration-200 hover:scale-110 hover:text-white hover:opacity-100 hover:grayscale-0"
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
