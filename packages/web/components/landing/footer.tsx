import Image from 'next/image'
import Link from 'next/link'

import { CookiePreferencesLink } from '@/components/consent/CookiePreferencesLink'
import { LandingHashLink } from '@/components/landing/landing-hash-link'
import { NewsletterForm } from '@/components/landing/newsletter-form'
import {
  WaitlistInlineForm,
  WaitlistOpenButton,
} from '@/components/landing/waitlist'
import { scoutLogo } from '@/lib/scout-logo'
import { isWaitlistMode } from '@/lib/waitlist-mode'
import { ArrowUp } from 'lucide-react'

type SocialIconProps = { className?: string; strokeWidth?: number }

function XIcon({ className }: SocialIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

const PRODUCT_LINKS = [
  { label: 'Resume', href: '/resume' },
  { label: 'Roles', href: '/roles' },
  { label: 'Tracker', href: '/tracker' },
  { label: 'Copilot', href: '/copilot' },
] as const

const PRODUCT_LINKS_WAITLIST = [
  { label: 'How it works', href: '/#about' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/#faq' },
  { label: 'Blog', href: '/blog' },
] as const

const COMPANY_LINKS = [
  { label: 'Blog', href: '/blog' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'About', href: '/#about' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/#faq' },
] as const

/** Waitlist mode: Product already covers How it works / Pricing / FAQ / Blog. */
const COMPANY_LINKS_WAITLIST = [
  { label: 'Changelog', href: '/changelog' },
  { label: 'About', href: '/#about' },
] as const

const ACCOUNT_LINKS = [
  { label: 'Sign in', href: '/sign-in' },
  { label: 'Sign up', href: '/sign-up' },
  { label: 'Dashboard', href: '/dashboard' },
] as const

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
] as const

const footerLinkClass =
  'font-body inline-flex min-h-10 items-center text-[14px] text-[#A1A1AA] transition-all duration-200 hover:translate-x-0.5 hover:text-white sm:min-h-11 sm:text-[15px]'

function FooterLink({ label, href }: { label: string; href: string }) {
  if (href.includes('#')) {
    return (
      <LandingHashLink href={href} className={footerLinkClass}>
        {label}
      </LandingHashLink>
    )
  }
  return (
    <Link href={href} className={footerLinkClass}>
      {label}
    </Link>
  )
}

export function Footer() {
  const waitlist = isWaitlistMode()

  const columns: {
    heading: string
    links: readonly { label: string; href: string }[]
  }[] = [
    {
      heading: 'Product',
      links: waitlist ? PRODUCT_LINKS_WAITLIST : PRODUCT_LINKS,
    },
    {
      heading: 'Company',
      links: waitlist ? COMPANY_LINKS_WAITLIST : COMPANY_LINKS,
    },
    {
      heading: 'Account',
      links: waitlist ? [] : ACCOUNT_LINKS,
    },
    { heading: 'Legal', links: LEGAL_LINKS },
  ]

  return (
    <footer className="relative px-4 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] pt-10 sm:px-6 sm:pb-10 sm:pt-20 lg:px-12 md:pb-10">
      <div className="mx-auto max-w-7xl">
        <div className="glass-card relative overflow-hidden rounded-xl p-5 sm:rounded-3xl sm:p-10 md:p-14">
          <div className="relative grid grid-cols-1 items-center gap-6 sm:gap-10 lg:grid-cols-2">
            <div>
              <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
                {waitlist ? 'Early access' : 'Newsletter'}
              </p>
              <h3 className="mt-2 font-headline text-xl font-medium tracking-[-0.03em] text-white sm:mt-3 sm:text-3xl md:text-4xl">
                {waitlist ? 'Get a seat when we open.' : 'Stay in the loop.'}
              </h3>
              <p className="mt-2 font-body text-[13.5px] text-[#A1A1AA] sm:mt-3 sm:text-[15px]">
                {waitlist
                  ? "Scout is in private beta. Leave your email and we'll notify you when public access is available."
                  : 'Tactical updates on landing internships, plus product news from the Scout team.'}
              </p>
            </div>

            {waitlist ? <WaitlistInlineForm source="footer" /> : <NewsletterForm />}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:mt-16 sm:gap-x-8 sm:gap-y-12 md:grid-cols-4 lg:mt-20 lg:grid-cols-6">
          <div className="col-span-2 origin-left md:col-span-4 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 sm:gap-3">
              <Image
                src={scoutLogo}
                alt="Scout AI Logo"
                width={48}
                height={48}
                draggable={false}
                className="h-9 w-9 select-none object-contain sm:h-12 sm:w-12"
              />
              <span className="font-headline text-lg font-semibold tracking-tight text-white sm:text-2xl">
                Scout
              </span>
            </Link>
            <p className="mt-3 max-w-xs font-body text-[13px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-sm">
              Built for students by students. Automating the internship hunt for
              the next generation of engineers.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <h4 className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-[#888888] sm:text-[11px] sm:tracking-[0.2em]">
                {col.heading}
              </h4>
              <ul className="mt-4 space-y-1 sm:mt-6 sm:space-y-4">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink label={link.label} href={link.href} />
                  </li>
                ))}
                {col.heading === 'Account' && waitlist ? (
                  <li>
                    <WaitlistOpenButton source="footer_account" className={footerLinkClass}>
                      Join waitlist
                    </WaitlistOpenButton>
                  </li>
                ) : null}
                {col.heading === 'Legal' ? (
                  <li>
                    <CookiePreferencesLink />
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-5 border-t border-white/5 pt-6 sm:mt-16 sm:gap-6 sm:pt-8 md:flex-row">
          <p className="font-label text-[10px] uppercase tracking-[0.18em] text-[#888888] sm:text-[11px] sm:tracking-[0.2em]">
            © {new Date().getFullYear()} Scout. Never Apply Again
          </p>

          <LandingHashLink
            href="#top"
            className="font-label group inline-flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#A1A1AA] transition-colors duration-150 hover:border-white/25 hover:bg-white/[0.05] hover:text-white sm:min-h-11 sm:px-5 sm:py-2.5 sm:text-[12px] sm:tracking-[0.18em]"
          >
            Back to top
            <ArrowUp className="h-4 w-4 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </LandingHashLink>

          <div className="flex items-center gap-2">
            {[
              { Icon: XIcon, label: 'X', href: 'https://x.com/getscoutintern' },
            ].map(({ Icon, label, href }) => {
              const isExternal = href.startsWith('http')
              return (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  {...(isExternal
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="inline-flex h-11 w-11 items-center justify-center text-[#888888] opacity-50 grayscale transition-all duration-200 hover:scale-110 hover:text-white hover:opacity-100 hover:grayscale-0"
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </footer>
  )
}
