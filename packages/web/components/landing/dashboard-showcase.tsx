'use client'

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import Image from 'next/image'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CircleSlash,
  Compass,
  ExternalLink,
  FileText,
  Info,
  LayoutDashboard,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  Upload,
  User,
} from 'lucide-react'

import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

const DESIGN_W = 1024
const DESIGN_H = 541
const SLIDE_INTERVAL_MS = 5000

const PRIMARY_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Resume', icon: FileText },
  { label: 'Jobs', icon: Compass },
  { label: 'Tracker', icon: Activity },
  { label: 'Copilot', icon: Bot },
] as const

const SCOUT_PLUS_NAV = { label: 'Analytics', icon: BarChart3 } as const

const FOOTER_NAV = [
  { label: 'Profile', icon: User },
  { label: 'Settings', icon: Settings },
] as const

type NavLabel =
  | (typeof PRIMARY_NAV)[number]['label']
  | (typeof SCOUT_PLUS_NAV)['label']
  | (typeof FOOTER_NAV)[number]['label']

const SLIDES: {
  nav: NavLabel
  crumb: string[]
  /** Explore auto-selects Strong Fits — Send Scout turns active with a count. */
  sendScoutCount?: number
  render: () => ReactElement
}[] = [
  { nav: 'Dashboard', crumb: ['SCOUT', 'DASHBOARD'], render: () => <DashboardSlide /> },
  {
    nav: 'Resume',
    crumb: ['SCOUT', 'RESUME', 'ANALYSIS'],
    render: () => <ResumeSlide />,
  },
  {
    nav: 'Jobs',
    crumb: ['SCOUT', 'EXPLORE'],
    sendScoutCount: 15,
    render: () => <ExploreSlide />,
  },
  { nav: 'Tracker', crumb: ['SCOUT', 'TRACKER'], render: () => <TrackerSlide /> },
  { nav: 'Copilot', crumb: ['SCOUT', 'COPILOT'], render: () => <CopilotSlide /> },
]

export function LandingDashboardShowcase() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [index, setIndex] = useState(0)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / DESIGN_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      SLIDE_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [index, isDesktop])

  const activeNav = SLIDES[index].nav
  const sendScoutCount = SLIDES[index].sendScoutCount

  return (
    <div className="select-none">
      <div
        ref={wrapperRef}
        className="relative w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0a] sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent"
        style={{ height: DESIGN_H * scale }}
      >
        <div
          aria-hidden
          className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-xl border-0 bg-[#0a0a0a] sm:rounded-2xl sm:border sm:border-white/[0.08]"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
          }}
        >
          <div className="flex h-full">
            <Sidebar active={activeNav} />

            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar crumb={SLIDES[index].crumb} sendScoutCount={sendScoutCount} />
              <div className="relative flex-1 overflow-hidden">
                {isDesktop ? (
                  <div
                    className="flex h-full transition-transform duration-700 ease-in-out motion-reduce:transition-none"
                    style={{ transform: `translateX(-${index * 100}%)` }}
                  >
                    {SLIDES.map((slide, i) => (
                      <div key={i} className="h-full w-full shrink-0 overflow-hidden">
                        {slide.render()}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Phones: only the active slide in the DOM (much less JS/paint).
                  <div className="h-full w-full overflow-hidden">{SLIDES[index].render()}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop: side chevrons outside the frame */}
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
          aria-label="Previous preview"
          className="absolute -left-8 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center text-white/70 transition-colors duration-200 hover:text-white/60 sm:flex"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          aria-label="Next preview"
          className="absolute -right-8 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center text-white/70 transition-colors duration-200 hover:text-white/60 sm:flex"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={1.5} />
        </button>
      </div>

      {/* Mobile: chevrons + dots below the frame so they never cover the UI */}
      <div className="mt-3 flex items-center justify-center gap-1 sm:mt-5">
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
          aria-label="Previous preview"
          className="flex h-11 w-11 items-center justify-center text-white/60 transition-colors hover:text-white sm:hidden"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div
          className="flex items-center justify-center gap-1"
          role="tablist"
          aria-label="Product preview slides"
        >
          {SLIDES.map((slide, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              onClick={() => setIndex(i)}
              aria-label={`Show ${slide.nav} preview`}
              aria-selected={i === index}
              className="group flex h-11 w-9 items-center justify-center sm:w-11"
            >
              <span
                className={cn(
                  'h-1.5 rounded-full transition-all duration-500 motion-reduce:transition-none',
                  i === index
                    ? 'w-5 bg-primary'
                    : 'w-1.5 bg-white/15 group-hover:bg-white/40',
                )}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          aria-label="Next preview"
          className="flex h-11 w-11 items-center justify-center text-white/60 transition-colors hover:text-white sm:hidden"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------- Sidebar ---------------------------------- */

function ShowcaseNavItem({
  label,
  icon: Icon,
  active,
}: {
  label: string
  icon: (typeof PRIMARY_NAV)[number]['icon']
  active: boolean
}) {
  return (
    <div
      className={cn(
        'mx-1.5 flex items-center gap-2 rounded-md px-2 py-[7px] text-[11px] transition-colors duration-300',
        active ? 'bg-[#1c1c1c] text-white' : 'text-[#888]',
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
          active ? 'text-[#FF6733]' : 'text-[#888]',
        )}
        strokeWidth={1.75}
      />
      <span className="font-label font-medium">{label}</span>
    </div>
  )
}

function Sidebar({ active }: { active: NavLabel }) {
  return (
    <aside className="flex w-[150px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0a]">
      <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-3.5">
        <Image
          src={scoutLogo}
          alt=""
          width={22}
          height={22}
          draggable={false}
          className="h-[22px] w-[22px] object-contain"
        />
        <span className="font-headline text-[15px] font-semibold tracking-tight text-white">
          Scout
        </span>
      </div>

      <div className="mx-2 mb-3 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF6733]/15 font-label text-[10px] font-medium text-[#FF6733]">
          A
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-label text-[11px] font-medium text-white">
            Austin
          </div>
          {/* Mirrors PlanBadge for scout_plus — gold, not orange text */}
          <span className="mt-0.5 inline-flex items-center rounded-md border border-[#F5C542]/25 bg-[#F5C542]/[0.06] px-1.5 py-px font-label text-[7px] font-semibold uppercase tracking-[0.12em] text-[#D4AF37]">
            Scout+
          </span>
        </div>
        <ChevronDown className="h-3 w-3 shrink-0 text-[#555]" strokeWidth={2} />
      </div>

      <nav className="flex-1 space-y-px py-1">
        {PRIMARY_NAV.map((item) => (
          <ShowcaseNavItem
            key={item.label}
            label={item.label}
            icon={item.icon}
            active={item.label === active}
          />
        ))}
        <ShowcaseNavItem
          label={SCOUT_PLUS_NAV.label}
          icon={SCOUT_PLUS_NAV.icon}
          active={SCOUT_PLUS_NAV.label === active}
        />
      </nav>

      <div className="space-y-2 pb-3 pt-1">
        <div aria-hidden className="mx-4 h-px bg-white/[0.07]" />

        <div className="space-y-px">
          {FOOTER_NAV.map((item) => (
            <ShowcaseNavItem
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={item.label === active}
            />
          ))}
        </div>

        <div className="mx-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 whitespace-nowrap font-mono text-[7px] uppercase tracking-[0.1em] text-[#666]">
              Application credits
            </span>
            <Info className="h-2.5 w-2.5 shrink-0 text-[#555]" strokeWidth={2} />
          </div>
          <div className="mt-1 font-headline text-[18px] font-medium leading-none tracking-tight">
            <span className="text-[#FF6733]">93</span>
            <span className="text-[#444]"> / </span>
            <span className="text-[#888]">100</span>
          </div>
          <p className="mt-1 font-body text-[7px] leading-snug text-[#555]">
            remaining this billing period
          </p>
        </div>

        <p className="text-center font-label text-[7px] uppercase tracking-[0.2em] text-[#333]">
          v1.0
        </p>
      </div>
    </aside>
  )
}

function Topbar({
  crumb,
  sendScoutCount,
}: {
  crumb: string[]
  sendScoutCount?: number
}) {
  const sendActive = sendScoutCount != null && sendScoutCount > 0

  return (
    <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#080808]/80 px-5">
      <ol className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#444]">
        {crumb.map((part, i) => (
          <li key={part} className="flex items-center gap-1">
            {i > 0 ? <span className="text-[#2a2a2a]">/</span> : null}
            <span className={i === crumb.length - 1 ? 'text-[#666]' : 'text-[#444]'}>
              {part}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        {/* NotificationBell chrome — bordered button, subtle unread dot */}
        <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-[#888]">
          <Bell className="h-3 w-3" strokeWidth={1.75} />
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
        </span>
        {sendActive ? (
          <span className="relative inline-flex items-center gap-1 rounded-md border border-primary/70 bg-[hsl(var(--brand-hover))] px-2 py-1 font-label text-[9px] font-semibold text-white">
            <Image
              src={scoutLogo}
              alt=""
              width={10}
              height={10}
              draggable={false}
              className="h-2.5 w-auto object-contain"
            />
            Send Scout ({sendScoutCount})
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 font-label text-[9px] font-semibold text-[#666] saturate-[0.25]">
            <Image
              src={scoutLogo}
              alt=""
              width={10}
              height={10}
              draggable={false}
              className="h-2.5 w-auto object-contain opacity-35 grayscale"
            />
            Send Scout
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------- Dashboard ---------------------------------- */

const QUICK_ACTIONS = [
  'View your matched jobs',
  'Check role alignment',
  'Track your applications',
  'Optimize your resume',
] as const

function DashboardSlide() {
  return (
    <div className="flex h-full flex-col gap-3 px-5 pt-5 pb-3">
      <header className="space-y-0.5">
        <p className="font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666]">
          Welcome back
        </p>
        <h2 className="font-headline text-[20px] font-medium tracking-[-0.02em] text-white">
          Austin, your dashboard is ready.
        </h2>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        <DashStat
          label="Scout Score"
          value="90"
          delta={35}
          subtext="vs. 55 before Scout"
        />
        <DashStat label="Applied" value="36" subtext="internships this session" />
        <DashStat
          label="Needs Attention"
          value="2"
          valueAccent
          headerTrailing={
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[#555]">
              <Info className="h-3 w-3" strokeWidth={1.75} />
            </span>
          }
          subtext="verification codes & fixes"
        />
      </section>

      <section className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF6733]/10">
            <FileText className="h-4 w-4 text-[#FF6733]" strokeWidth={1.5} />
          </span>
          <div>
            <p className="font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666]">
              Resume Score
            </p>
            <p className="font-headline text-lg font-medium tracking-tight text-white">
              90<span className="ml-1 font-body text-xs text-[#666]">/ 100</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.1] bg-transparent px-2.5 font-label text-[10px] font-medium text-white">
            <Upload className="h-3 w-3" strokeWidth={2} />
            Upload new
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/70 bg-primary px-2.5 font-label text-[10px] font-semibold text-primary-foreground">
            View analysis
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 items-start gap-2.5">
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF6733]/10">
            <Bot className="h-3.5 w-3.5 text-[#FF6733]" strokeWidth={1.75} />
          </span>
          <h3 className="font-headline text-sm font-medium tracking-tight text-white">
            Ask Scout anything
          </h3>
          <p className="font-body text-[11px] leading-snug text-[#999]">
            Your resume, your roles, your gaps — Scout knows it all.
          </p>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-body text-[11px] text-[#666]">
            <span>Am I ready for Stripe?</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <h3 className="mb-2 font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666]">
            Quick actions
          </h3>
          <ul>
            {QUICK_ACTIONS.map((label) => (
              <li
                key={label}
                className="flex items-center justify-between gap-2 border-b border-white/[0.04] py-2 font-body text-xs text-[#999] last:border-0"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CircleDashed className="h-3 w-3 text-[#444]" strokeWidth={2} />
                  {label}
                </span>
                <ArrowRight className="h-3 w-3 text-[#444]" strokeWidth={2} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

function DashStat({
  label,
  value,
  subtext,
  delta,
  valueAccent,
  headerTrailing,
}: {
  label: string
  value: string
  subtext?: string
  delta?: number
  valueAccent?: boolean
  headerTrailing?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-label text-[9px] font-medium uppercase tracking-[0.2em] text-[#666]">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {delta != null && delta > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 font-label text-[8px] font-semibold text-[#FF6733]">
              <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.25} />+{delta}
            </span>
          ) : null}
          {headerTrailing}
        </div>
      </div>
      <div
        className={cn(
          'mt-1.5 font-headline text-[24px] font-medium leading-none tracking-[-0.03em]',
          valueAccent ? 'text-[#FF6733]' : 'text-white',
        )}
      >
        {value}
      </div>
      <span className="mt-1.5 font-body text-[10px] text-[#666]">
        {subtext ?? '\u00A0'}
      </span>
    </div>
  )
}

/* ---------------------------------- Explore ---------------------------------- */

type JobCard = {
  company: string
  title: string
  location: string
  tags: string[]
  match: number
  portal: 'greenhouse' | 'lever' | 'ashby' | 'direct'
  sponsors?: boolean
  remote?: boolean
  selected?: boolean
  tailored?: boolean
}

type FitTone = 'green' | 'orange' | 'muted'

const PORTAL_PILL: Record<
  JobCard['portal'],
  { label: string; classes: string }
> = {
  greenhouse: { label: 'Greenhouse', classes: 'bg-[#22c55e]/10 text-[#22c55e]' },
  lever: { label: 'Lever', classes: 'bg-[#3b82f6]/10 text-[#3b82f6]' },
  ashby: { label: 'Ashby', classes: 'bg-purple-500/10 text-purple-400' },
  direct: { label: 'Direct', classes: 'bg-white/5 text-[#888]' },
}

const MATCH_PILL: Record<FitTone, string> = {
  green: 'bg-[#22c55e]/10 text-[#22c55e]',
  orange: 'bg-primary/10 text-[#FF6733]',
  muted: 'bg-white/5 text-[#888]',
}

const EXPLORE_COLUMNS: {
  label: string
  tone: FitTone
  count: number
  jobs: JobCard[]
}[] = [
  {
    label: 'Strong Fit',
    tone: 'green',
    count: 15,
    jobs: [
      {
        company: 'Tenstorrent University',
        title: 'Mechanical Engineer, Intern',
        location: 'Toronto, Ontario, Canada',
        tags: ['AWS', 'CAD', 'Excel'],
        match: 88,
        portal: 'greenhouse',
        sponsors: true,
        selected: true,
        tailored: true,
      },
      {
        company: 'Endou Corporation',
        title: 'Mechanical Engineering Intern',
        location: 'Saratoga, Santa Clara County',
        tags: ['Remote eligible'],
        match: 87,
        portal: 'direct',
        remote: true,
        selected: true,
      },
    ],
  },
  {
    label: 'Good Fit',
    tone: 'orange',
    count: 20,
    jobs: [
      {
        company: 'Tenstorrent University',
        title: 'AI Compiler Software Intern (PEY)',
        location: 'Toronto, Ontario',
        tags: ['Python', 'C++'],
        match: 63,
        portal: 'greenhouse',
        sponsors: true,
      },
      {
        company: 'Docubank',
        title: 'Data Science PhD Intern',
        location: 'Kirkland, Washington, United States',
        tags: ['Machine Learning', 'Excel'],
        match: 53,
        portal: 'ashby',
      },
    ],
  },
  {
    label: 'Stretch',
    tone: 'muted',
    count: 15,
    jobs: [
      {
        company: 'Tenstorrent University',
        title: 'Models Infra - Product Software Intern (Serbia)',
        location: 'Belgrade, Serbia',
        tags: ['Python'],
        match: 50,
        portal: 'greenhouse',
        sponsors: true,
      },
      {
        company: 'Tenstorrent University',
        title: 'IP Product Operations Intern',
        location: 'Canada',
        tags: ['AWS'],
        match: 50,
        portal: 'lever',
        sponsors: true,
      },
    ],
  },
]

const FIT_TEXT: Record<FitTone, string> = {
  green: 'text-emerald-400',
  orange: 'text-[#FF6733]',
  muted: 'text-[#888]',
}
const FIT_DOT: Record<FitTone, string> = {
  green: 'bg-emerald-400',
  orange: 'bg-[#FF6733]',
  muted: 'bg-[#666]',
}

function ExploreSlide() {
  return (
    <div className="flex h-full flex-col gap-2.5 px-5 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-[22px] font-medium tracking-[-0.02em] text-white">
            Explore
          </h2>
          <p className="font-body text-[10px] text-[#666]">
            Jobs matched to your resume
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-transparent px-2 py-1 font-label text-[9px] font-medium text-[#bbb]">
          <RefreshCw className="h-2.5 w-2.5" strokeWidth={2} />
          Refresh
        </span>
      </div>

      {/* Search row + filter chips — mirrors Explore header */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#555]"
            strokeWidth={2}
          />
          <span className="flex h-7 w-full items-center rounded-md border border-white/15 bg-transparent pl-7 pr-2 font-body text-[10px] text-[#666]">
            Search all internships — SWE, chem eng, EE…
          </span>
        </div>
        <div className="relative w-[28%]">
          <MapPin
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#555]"
            strokeWidth={2}
          />
          <span className="flex h-7 w-full items-center rounded-md border border-white/15 bg-transparent pl-7 pr-2 font-body text-[10px] text-[#666]">
            Filter by location
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {['All', 'Remote Only', 'Visa Friendly'].map((f, i) => (
            <span
              key={f}
              className={cn(
                'rounded-md px-2 py-1 font-label text-[9px] font-medium',
                i === 0
                  ? 'border border-primary/70 bg-primary text-primary-foreground'
                  : 'border border-white/[0.08] text-[#888]',
              )}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.015] py-2">
        {[
          { n: '15', label: 'Strong Fits', tone: 'green' as FitTone },
          { n: '20', label: 'Good Fits', tone: 'orange' as FitTone },
          { n: '15', label: 'Stretch', tone: 'muted' as FitTone },
        ].map((t, i) => (
          <div
            key={t.label}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5',
              i > 0 && 'border-l border-white/[0.06]',
            )}
          >
            <span
              className={cn('font-headline text-sm font-semibold', FIT_TEXT[t.tone])}
            >
              {t.n}
            </span>
            <span className="font-label text-[9px] uppercase tracking-[0.16em] text-[#777]">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="font-label text-[9px] text-[#666]">15 jobs selected</span>
        <span className="font-label text-[9px] text-[#666]">
          Select all &nbsp;|&nbsp; Deselect all
        </span>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-hidden">
        {EXPLORE_COLUMNS.map((col) => (
          <div key={col.label} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', FIT_DOT[col.tone])} />
              <span className="font-label text-[9px] font-semibold uppercase tracking-[0.16em] text-[#888]">
                {col.label}
              </span>
              <span className="ml-auto rounded-full border border-white/[0.08] px-1.5 font-label text-[8px] text-[#666]">
                {col.count}
              </span>
            </div>
            {col.jobs.map((job) => (
              <ExploreCard key={job.title} job={job} tone={col.tone} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ExploreCard({ job, tone }: { job: JobCard; tone: FitTone }) {
  const portal = PORTAL_PILL[job.portal]
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border p-2',
        job.selected
          ? 'border-[#FF6733]/60 bg-primary/[0.04]'
          : 'border-white/[0.06] bg-white/[0.02]',
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="truncate font-mono text-[7px] uppercase tracking-wider text-[#888]">
          {job.company}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {job.tailored ? (
            <span className="rounded-full bg-primary/10 px-1 py-px font-label text-[7px] font-semibold uppercase tracking-wider text-[#FF6733]">
              Tailored
            </span>
          ) : null}
          <span
            className={cn(
              'rounded-full px-1.5 py-px font-label text-[8px] font-semibold uppercase tracking-wider',
              MATCH_PILL[tone],
            )}
          >
            {job.match}% match
          </span>
          <span
            className={cn(
              'flex h-3.5 w-3.5 items-center justify-center rounded-full',
              job.selected
                ? 'bg-primary text-primary-foreground'
                : 'border border-white/15 text-transparent',
            )}
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </div>
      </div>

      <h4 className="font-headline text-[11px] font-medium leading-snug tracking-tight text-white">
        {job.title}
      </h4>

      <div className="flex items-center gap-1.5">
        <p className="flex min-w-0 flex-1 items-center gap-1 font-body text-[8px] text-[#666]">
          <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
          <span className="truncate">{job.location}</span>
        </p>
        {job.remote ? (
          <span className="shrink-0 rounded-full bg-[#22c55e]/10 px-1.5 py-px font-label text-[7px] font-medium text-[#22c55e]">
            Remote
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1">
        {job.tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-primary/10 px-1.5 py-px font-label text-[8px] text-[#FF6733]"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-label text-[8px] font-medium',
            portal.classes,
          )}
        >
          <ExternalLink className="h-2 w-2" strokeWidth={2} />
          {portal.label}
        </span>
        {job.sponsors ? (
          <span className="font-label text-[8px] text-[#22c55e]">✓ Sponsors visas</span>
        ) : null}
      </div>

      <div className="mt-0.5 flex items-center justify-between border-t border-white/[0.06] pt-1.5">
        <span className="font-label text-[8px] text-[#777]">View job →</span>
        <span className="inline-flex items-center gap-0.5 font-label text-[8px] uppercase tracking-wider text-[#666]">
          Tailored resume
          <ChevronDown className="h-2.5 w-2.5" strokeWidth={2} />
        </span>
      </div>
    </div>
  )
}

/* ---------------------------------- Tracker ---------------------------------- */

type TrackerTone = 'muted' | 'orange' | 'green' | 'red' | 'amber'
type TrackerPortal = 'greenhouse' | 'lever' | 'ashby' | 'workday'
type TrackerCard = {
  company: string
  role: string
  portal: TrackerPortal
  time?: string
  /** Applied successfully chip */
  appliedOk?: boolean
  /** Live APPLYING state with elapsed timer */
  applying?: boolean
  /** Cancelled-by-you outcome chip */
  cancelled?: boolean
  /** Informational attention message (not "Answer Required") */
  attentionMsg?: string
}

const TRACKER_PORTAL: Record<TrackerPortal, { label: string; classes: string }> = {
  greenhouse: { label: 'Greenhouse', classes: 'bg-[#22c55e]/10 text-[#22c55e]' },
  lever: { label: 'Lever', classes: 'bg-[#3b82f6]/10 text-[#3b82f6]' },
  ashby: { label: 'Ashby', classes: 'bg-purple-500/10 text-purple-400' },
  workday: { label: 'Workday', classes: 'bg-white/[0.06] text-[#888]' },
}

const TRACKER_COLUMNS: {
  label: string
  tone: TrackerTone
  cards: TrackerCard[]
}[] = [
  {
    label: 'QUEUED',
    tone: 'muted',
    cards: [
      {
        company: 'Verkada',
        role: 'Technical Support Engineering Intern',
        portal: 'greenhouse',
        time: '3h ago',
      },
      {
        company: 'Rocket Lab',
        role: 'Practical Engineering Intern Fall 2026',
        portal: 'greenhouse',
        time: '1d ago',
      },
    ],
  },
  {
    label: 'IN PROGRESS',
    tone: 'orange',
    cards: [
      {
        company: 'Microsoft',
        role: 'Software Engineer Intern',
        portal: 'workday',
        applying: true,
      },
    ],
  },
  {
    label: 'APPLIED',
    tone: 'green',
    cards: [
      {
        company: 'Google',
        role: 'Software Engineer Intern',
        portal: 'greenhouse',
        time: '2d ago',
        appliedOk: true,
      },
      {
        company: 'Tesla',
        role: 'Firmware Engineering Intern',
        portal: 'lever',
        time: '4d ago',
        appliedOk: true,
      },
    ],
  },
  {
    label: 'FAILED',
    tone: 'red',
    cards: [
      {
        company: 'Intel',
        role: 'Hardware Engineering Intern',
        portal: 'greenhouse',
        time: '2d ago',
        cancelled: true,
      },
    ],
  },
  {
    label: 'ATTENTION',
    tone: 'amber',
    cards: [
      {
        company: 'Uncountable',
        role: 'Software Engineering Intern',
        portal: 'ashby',
        time: '4d ago',
        attentionMsg: 'This Ashby form flagged the application as possible spam.',
      },
    ],
  },
]

const TRACKER_TOP: Record<TrackerTone, string> = {
  muted: 'bg-[#444]',
  orange: 'bg-[#FF6733]',
  green: 'bg-[#22c55e]',
  red: 'bg-[#ef4444]',
  amber: 'bg-[#f59e0b]',
}
const TRACKER_DOT: Record<TrackerTone, string> = {
  muted: 'bg-[#444]',
  orange: 'bg-[#FF6733]',
  green: 'bg-[#22c55e]',
  red: 'bg-[#ef4444]',
  amber: 'bg-[#f59e0b]',
}
const TRACKER_LABEL: Record<TrackerTone, string> = {
  muted: 'text-[#666]',
  orange: 'text-[#FF6733]',
  green: 'text-[#22c55e]',
  red: 'text-[#ef4444]',
  amber: 'text-[#f59e0b]',
}

const LIVE_FEED = [
  {
    status: 'APPLIED',
    color: '#22c55e',
    company: 'NVIDIA',
    role: 'GPU Software Engineer Intern',
    portal: 'greenhouse' as TrackerPortal,
    timing: 'Applied 2d ago',
  },
  {
    status: 'APPLYING',
    color: '#FF6733',
    company: 'Microsoft',
    role: 'Software Engineer Intern',
    portal: 'workday' as TrackerPortal,
    timing: '1m 24s',
  },
  {
    status: 'ATTENTION',
    color: '#f59e0b',
    company: 'Uncountable',
    role: 'Software Engineering Intern',
    portal: 'ashby' as TrackerPortal,
    timing: 'Needs review',
  },
] as const

function TrackerSlide() {
  return (
    <div className="flex h-full flex-col">
      {/* MissionControlHeader twin */}
      <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#444]">
            SCOUT AGENT
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            <h2 className="font-headline text-[20px] font-medium tracking-[-0.02em] text-white">
              Run complete
            </h2>
          </div>
          <p className="mt-1 font-mono text-[9px] text-[#555]">
            Started 2d ago · 7 applications
          </p>
        </div>
        <div className="flex items-start gap-5 pr-1">
          <RunStat value="36" label="APPLIED" tone="text-[#22c55e]" />
          <RunStat value="4" label="FAILED" tone="text-[#ef4444]" />
          <RunStat value="2" label="ATTENTION" tone="text-[#f59e0b]" />
        </div>
      </div>

      {/* Progress bar under a completed run */}
      <div className="h-0.5 w-full bg-white/[0.04]">
        <div className="h-full w-full bg-gradient-to-r from-[#FF6733] to-[#22c55e]" />
      </div>

      {/* LiveApplicationFeed rows */}
      <div className="border-b border-white/[0.04]">
        {LIVE_FEED.map((row) => {
          const portal = TRACKER_PORTAL[row.portal]
          return (
            <div
              key={row.company + row.status}
              className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-1.5 last:border-0"
            >
              <div className="flex w-[72px] shrink-0 items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span
                  className="font-mono text-[8px] tracking-wider"
                  style={{ color: row.color }}
                >
                  {row.status}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-label text-[10px] font-medium text-white">
                  {row.company}
                </p>
                <div className="mt-px flex items-center gap-1.5">
                  <p className="truncate font-body text-[8px] text-[#555]">{row.role}</p>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded px-1 py-px font-label text-[7px] font-medium',
                      portal.classes,
                    )}
                  >
                    {portal.label}
                  </span>
                </div>
              </div>
              <span className="shrink-0 font-label text-[8px] text-[#666]">{row.timing}</span>
              <span className="inline-flex shrink-0 items-center gap-0.5 font-label text-[8px] text-[#777]">
                View
                <ArrowRight className="h-2 w-2" strokeWidth={2} />
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between px-5 pt-2.5">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#444]">
          APPLICATION HISTORY
        </p>
        <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-1.5 py-px font-mono text-[8px] text-[#555]">
          7
        </span>
      </div>

      <div className="mt-1.5 grid flex-1 grid-cols-5 gap-1.5 overflow-hidden px-5 pb-2">
        {TRACKER_COLUMNS.map((col) => (
          <div key={col.label} className="flex min-w-0 flex-col">
            <div className={cn('h-0.5 w-full rounded-full', TRACKER_TOP[col.tone])} />
            <div className="mt-1.5 mb-1.5 flex items-center gap-1">
              <span
                className={cn('h-1.5 w-1.5 rounded-full', TRACKER_DOT[col.tone])}
              />
              <span
                className={cn(
                  'truncate font-mono text-[7px] uppercase tracking-wider',
                  TRACKER_LABEL[col.tone],
                )}
              >
                {col.label}
              </span>
              <span className="ml-auto font-mono text-[7px] text-[#444]">
                {col.cards.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {col.cards.map((card) => (
                <TrackerCardView key={card.company + card.role} card={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrackerCardView({ card }: { card: TrackerCard }) {
  const portal = TRACKER_PORTAL[card.portal]
  return (
    <div className="flex flex-col gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] p-1.5">
      <span className="truncate font-label text-[10px] font-medium text-white">
        {card.company}
      </span>
      <span className="line-clamp-2 font-body text-[8px] leading-tight text-[#777]">
        {card.role}
      </span>
      <span
        className={cn(
          'inline-flex w-fit items-center rounded px-1 py-px font-label text-[7px] font-medium',
          portal.classes,
        )}
      >
        {portal.label}
      </span>
      {card.applying ? (
        <span className="inline-flex items-center gap-1 font-mono text-[8px] text-[#FF6733]">
          <span className="h-1 w-1 animate-pulse rounded-full bg-[#FF6733] motion-reduce:animate-none" />
          APPLYING · 1m 24s
        </span>
      ) : null}
      {card.appliedOk ? (
        <span className="inline-flex items-center gap-1 font-label text-[7px] font-medium text-[#22c55e]">
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
          Applied successfully
        </span>
      ) : null}
      {card.cancelled ? (
        <span className="inline-flex w-fit items-center gap-1 rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-label text-[7px] font-medium text-[#888]">
          <CircleSlash className="h-2 w-2 shrink-0" strokeWidth={2} />
          Cancelled by you
        </span>
      ) : null}
      {card.attentionMsg ? (
        <span className="flex items-start gap-1 font-label text-[7px] leading-snug text-[#f59e0b]">
          <Info className="mt-px h-2.5 w-2.5 shrink-0" strokeWidth={2} />
          <span className="line-clamp-2">{card.attentionMsg}</span>
        </span>
      ) : null}
      {card.time ? (
        <span className="font-label text-[7px] text-[#555]">{card.time}</span>
      ) : null}
    </div>
  )
}

function RunStat({
  value,
  label,
  tone,
}: {
  value: string
  label: string
  tone: string
}) {
  return (
    <div className="text-right">
      <div className={cn('font-headline text-[22px] font-medium leading-none', tone)}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[7px] uppercase tracking-widest text-[#444]">
        {label}
      </div>
    </div>
  )
}

/* ---------------------------------- Resume ---------------------------------- */

const RESUME_SCORE = 90
const RESUME_BALANCE = [
  { category: 'Structure', value: 92 },
  { category: 'Metrics', value: 68 },
  { category: 'Keywords', value: 74 },
  { category: 'Experience', value: 86 },
] as const

function resumeScoreColor(value: number): string {
  if (value >= 90) return '#22c55e'
  if (value >= 71) return '#FF6733'
  if (value >= 41) return '#f59e0b'
  return '#ef4444'
}

function resumeScoreLabel(value: number): string {
  if (value >= 90) return 'Excellent'
  if (value >= 71) return 'Strong'
  if (value >= 41) return 'Getting There'
  return 'Needs Work'
}

const RESUME_FINDINGS = [
  {
    severity: 'warning' as const,
    tag: 'missing metrics',
    issue:
      "First bullet of 'RateMyRoommate' project does not quantify scale (users, sessions, or data volume).",
    fix: "Quantify the scale of authentication or database records (e.g., 'supporting 100+ active user sessions').",
  },
  {
    severity: 'warning' as const,
    tag: 'vague description',
    issue:
      "Emerging Scholars Program description is too abstract for a software role ('interdisciplinary problem-solving').",
    fix: 'Specify the exact STEM tools, programming scripts, or data analysis methods used during the research.',
  },
  {
    severity: 'suggestion' as const,
    tag: 'weak verb',
    issue:
      "Bullet regarding 'Focusing on…' uses a weak gerund instead of a strong engineering verb.",
    fix: "Replace with a strong verb like 'Streamlined' or 'Engineered' to lead the accomplishment.",
  },
] as const

const SEVERITY_STYLE = {
  critical: {
    accent: 'text-red-400',
    border: 'border-red-500/40',
    label: 'Critical',
  },
  warning: {
    accent: 'text-amber-400',
    border: 'border-amber-500/40',
    label: 'Warning',
  },
  suggestion: {
    accent: 'text-[#FF6733]',
    border: 'border-[#FF6733]/40',
    label: 'Suggestion',
  },
} as const

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  // Round so SSR and client SVG attrs match (avoids hydration float noise).
  return {
    x: Math.round((cx + r * Math.cos(rad)) * 100) / 100,
    y: Math.round((cy + r * Math.sin(rad)) * 100) / 100,
  }
}

/** Scaled-down twin of ScoreGauge — same 270° tick ring + dashed guide. */
function ShowcaseScoreGauge({ score, size = 148 }: { score: number; size?: number }) {
  const START = 135
  const SWEEP = 270
  const SEGMENTS = 44
  const cx = size / 2
  const cy = size / 2
  const tickOuter = size / 2 - 2
  const tickLen = size * 0.075
  const tickInner = tickOuter - tickLen
  const dashRadius = Math.round((tickInner - 8) * 100) / 100
  const lit = Math.round((score / 100) * SEGMENTS)
  const numberSize = Math.max(28, Math.round(size * 0.24))
  const color = resumeScoreColor(score)
  const label = resumeScoreLabel(score)

  const ticks = Array.from({ length: SEGMENTS }, (_, i) => {
    const angle = START + (SWEEP / (SEGMENTS - 1)) * i
    return {
      from: polar(cx, cy, tickInner, angle),
      to: polar(cx, cy, tickOuter, angle),
      lit: i < lit,
    }
  })

  const zero = polar(cx, cy, tickInner - 3, START - 14)
  const hundred = polar(cx, cy, tickInner - 3, START + SWEEP + 14)

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="overflow-visible"
      >
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.from.x}
            y1={t.from.y}
            x2={t.to.x}
            y2={t.to.y}
            stroke={t.lit ? color : 'rgba(255,255,255,0.09)'}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r={dashRadius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          strokeDasharray="1 5"
        />
        <text
          x={zero.x}
          y={zero.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#555"
          fontSize={8}
          fontFamily="ui-monospace, monospace"
        >
          0
        </text>
        <text
          x={hundred.x}
          y={hundred.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#555"
          fontSize={8}
          fontFamily="ui-monospace, monospace"
        >
          100
        </text>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6">
        <span className="whitespace-nowrap font-label text-[6px] font-semibold uppercase tracking-[0.14em] text-[#555]">
          Scout Analysis
        </span>
        <span
          className="mt-0.5 font-headline font-extrabold leading-none tabular-nums text-white"
          style={{ fontSize: numberSize }}
        >
          {score}
        </span>
        <span className="mt-0.5 font-body text-[9px] leading-none text-[#555]">/ 100</span>
        <span
          className="mt-1 font-label text-[8px] font-semibold uppercase tracking-[0.2em]"
          style={{ color }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

/** Scaled-down twin of BalanceRadar — 4-axis diamond with brand fill. */
function ShowcaseBalanceRadar({ height = 132 }: { height?: number }) {
  const size = height
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.32
  const levels = [0.25, 0.5, 0.75, 1]

  const points = RESUME_BALANCE.map((d, i) => {
    const angle = -90 + i * 90
    return polar(cx, cy, (d.value / 100) * maxR, angle)
  })
  const poly = points.map((p) => `${p.x},${p.y}`).join(' ')

  const labelPos = RESUME_BALANCE.map((d, i) => {
    const angle = -90 + i * 90
    const offset = i === 0 ? maxR + 12 : i === 2 ? maxR + 11 : maxR + 18
    return { ...d, ...polar(cx, cy, offset, angle), angle: i }
  })

  return (
    <div className="w-full" style={{ height }}>
      <svg
        width="100%"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block overflow-visible"
      >
        {levels.map((lvl) => {
          const r = maxR * lvl
          const diamond = [0, 1, 2, 3]
            .map((i) => {
              const p = polar(cx, cy, r, -90 + i * 90)
              return `${p.x},${p.y}`
            })
            .join(' ')
          return (
            <polygon
              key={lvl}
              points={diamond}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          )
        })}
        {[0, 1, 2, 3].map((i) => {
          const p = polar(cx, cy, maxR, -90 + i * 90)
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          )
        })}
        <polygon
          points={poly}
          fill="rgba(255,103,51,0.12)"
          stroke="#FF6733"
          strokeWidth={2}
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#FF6733" />
        ))}
        {labelPos.map((l) => (
          <text
            key={l.category}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#8a8a8a"
            fontSize={9}
            fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          >
            {l.category}
          </text>
        ))}
      </svg>
    </div>
  )
}

function ShowcaseScoutMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={className}
    >
      <path d="M4.55 6.9 A6.9 6.9 0 0 1 17.45 6.9 L4.55 6.9 Z" />
      <path d="M4.55 11.3 A6.9 6.9 0 0 0 17.45 11.3 L4.55 11.3 Z" />
      <rect x="7.4" y="7.7" width="12.2" height="2.8" rx="1.4" />
      <circle cx="3.6" cy="9.1" r="1.7" />
      <path d="M9.5 21.4 L21.6 13.9 L17.2 21.9 L15.3 19.6 L13.4 21.9 Z" />
    </svg>
  )
}

function ResumeSlide() {
  return (
    <div className="flex h-full flex-col px-5 pb-3 pt-3">
      {/* Top bar: back link + orange glass role pill */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-body text-[11px] text-[#888]">
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Dashboard
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 font-body text-[11px] text-[#FF6733]">
          Analyzed for: Software Engineering
          <ChevronDown className="h-3 w-3 text-[#FF6733]" strokeWidth={2} />
        </span>
      </div>

      {/* md:grid-cols-[340px_1fr] scaled into showcase frame */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,268px)_minmax(0,1fr)] gap-5 overflow-hidden">
        <aside className="flex min-h-0 flex-col self-start">
          <div className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <ShowcaseScoreGauge score={RESUME_SCORE} size={148} />
            <div className="mt-3 w-full border-t border-white/[0.06] pt-3">
              <p className="font-label text-[8px] font-semibold uppercase tracking-[0.24em] text-[#666]">
                Resume Balance
              </p>
              <ShowcaseBalanceRadar height={128} />
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
          <header className="flex flex-col gap-0.5">
            <p className="font-label text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
              What Scout Found
            </p>
            <p className="font-body text-[11px] text-[#888]">3 issues detected</p>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            {RESUME_FINDINGS.map((f) => {
              const style = SEVERITY_STYLE[f.severity]
              return (
                <article
                  key={f.tag}
                  className={cn(
                    'rounded-xl border bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-md',
                    style.border,
                  )}
                >
                  <header className="flex items-center justify-between gap-2">
                    <span className={cn('inline-flex items-center gap-1.5', style.accent)}>
                      <ShowcaseScoutMark className="h-3.5 w-3.5" />
                      <span className="font-label text-[9px] font-semibold uppercase tracking-[0.18em]">
                        {style.label}
                      </span>
                    </span>
                    <span className="truncate font-mono text-[8px] uppercase tracking-[0.16em] text-[#555]">
                      {f.tag}
                    </span>
                  </header>
                  <p className="mt-2 font-body text-[11px] font-medium leading-snug text-white">
                    {f.issue}
                  </p>
                  <div className="mt-2 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#666]">
                      How Scout will fix it
                    </p>
                    <p className="mt-1 font-body text-[10px] leading-snug text-[#cfcfcf]">
                      {f.fix}
                    </p>
                  </div>
                  <footer className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.06] px-2 py-1 font-body text-[9px] font-medium text-white">
                      Fix with Scout
                      <ArrowRight className="h-2.5 w-2.5" strokeWidth={2} />
                    </span>
                    <span className="font-body text-[9px] text-[#888]">Ignore</span>
                  </footer>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------------------------- Copilot ---------------------------------- */

const COPILOT_CHATS = [
  { snippet: "Am I ready for Stripe?", time: '2m', active: true },
  { snippet: "How's my pipeline looking?", time: '1h', active: false },
  { snippet: 'Why is my resume scoring low?', time: '3h', active: false },
] as const

function CopilotSlide() {
  return (
    <div className="flex h-full overflow-hidden p-3">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.06]">
        {/* Conversation sidebar — mirrors ConversationSidebar */}
        <aside className="flex w-[168px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0a]">
          <div className="border-b border-white/[0.06] p-2">
            <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 font-label text-[10px] font-medium text-white">
              <Plus className="h-3 w-3" strokeWidth={2} />
              New chat
            </span>
          </div>
          <ul className="space-y-1 p-1.5">
            {COPILOT_CHATS.map((c) => (
              <li key={c.snippet}>
                <div
                  className={cn(
                    'flex flex-col gap-0.5 rounded-lg border px-2 py-1.5',
                    c.active
                      ? 'border-[#FF6733]/40 bg-[#FF6733]/10'
                      : 'border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'line-clamp-1 font-label text-[10px] font-medium',
                      c.active ? 'text-white' : 'text-[#bbb]',
                    )}
                  >
                    {c.snippet}
                  </span>
                  <span className="font-label text-[8px] text-[#555]">{c.time}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Chat pane */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#080808]">
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-3">
            {/* User bubble */}
            <div className="flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-[#FF6733] px-3 py-2 font-body text-[11px] leading-relaxed text-white shadow-[0_2px_12px_rgba(255,103,51,0.25)]">
                Am I ready for Stripe?
              </div>
            </div>

            {/* Assistant bubble */}
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]">
                <Image
                  src={scoutLogo}
                  alt=""
                  width={12}
                  height={12}
                  draggable={false}
                  className="h-3 w-3 object-contain"
                />
              </span>
              <div className="max-w-[82%] space-y-1.5 rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <p className="font-body text-[11px] leading-relaxed text-[#ddd]">
                  Almost — your resume is at{' '}
                  <span className="font-semibold text-white">90</span>, and you already
                  have strong fits at Stripe-adjacent roles.
                </p>
                <p className="font-body text-[11px] leading-relaxed text-[#ddd]">
                  Two gaps before you apply:
                </p>
                <ul className="space-y-0.5 pl-3 font-body text-[10px] leading-snug text-[#bbb]">
                  <li className="list-disc">
                    Add a metrics bullet on RateMyRoommate (scale / latency).
                  </li>
                  <li className="list-disc">
                    Clear the 2 items in Needs Attention first.
                  </li>
                </ul>
                <p className="font-body text-[11px] leading-relaxed text-[#ddd]">
                  Want me to queue Stripe SWE Intern once those are fixed?
                </p>
              </div>
            </div>

            {/* Follow-up user */}
            <div className="flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-[#FF6733] px-3 py-2 font-body text-[11px] leading-relaxed text-white shadow-[0_2px_12px_rgba(255,103,51,0.25)]">
                Yes — and what should I apply to next?
              </div>
            </div>
          </div>

          {/* Input — mirrors ChatInput */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1.5">
              <span className="flex-1 px-2 py-1 font-body text-[11px] text-[#555]">
                Ask Scout anything…
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
