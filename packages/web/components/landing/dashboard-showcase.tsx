'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import Image from 'next/image'
import {
  Activity,
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Compass,
  FileText,
  Info,
  KeyRound,
  LayoutDashboard,
  Loader2,
  MapPin,
  RefreshCw,
  Settings,
  Sprout,
  TrendingUp,
  User,
} from 'lucide-react'

import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

const DESIGN_W = 1024
const DESIGN_H = 541
const SLIDE_INTERVAL_MS = 5000

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Resume', icon: FileText },
  { label: 'Jobs', icon: Compass },
  { label: 'Tracker', icon: Activity },
  { label: 'Copilot', icon: Bot },
  { label: 'Profile', icon: User },
  { label: 'Analytics', icon: BarChart3 },
] as const

type NavLabel = (typeof NAV)[number]['label']

const SLIDES: {
  nav: NavLabel
  crumb: string[]
  render: () => ReactElement
}[] = [
  { nav: 'Dashboard', crumb: ['SCOUT', 'DASHBOARD'], render: () => <DashboardSlide /> },
  { nav: 'Jobs', crumb: ['SCOUT', 'EXPLORE'], render: () => <ExploreSlide /> },
  { nav: 'Tracker', crumb: ['SCOUT', 'TRACKER'], render: () => <TrackerSlide /> },
  {
    nav: 'Resume',
    crumb: ['SCOUT', 'RESUME', 'ANALYSIS'],
    render: () => <ResumeSlide />,
  },
]

export function LandingDashboardShowcase() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [index, setIndex] = useState(0)

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
    const id = setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      SLIDE_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [index])

  const activeNav = SLIDES[index].nav

  return (
    <div className="select-none">
      <div
        ref={wrapperRef}
        className="relative w-full"
        style={{ height: DESIGN_H * scale }}
      >
        <div
          aria-hidden
          className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a]"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
          }}
        >
          <div className="flex h-full">
            <Sidebar active={activeNav} />

            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar crumb={SLIDES[index].crumb} />
              <div className="relative flex-1 overflow-hidden">
                <div
                  className="flex h-full transition-transform duration-700 ease-in-out"
                  style={{ transform: `translateX(-${index * 100}%)` }}
                >
                  {SLIDES.map((slide, i) => (
                    <div key={i} className="h-full w-full shrink-0 overflow-hidden">
                      {slide.render()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
          aria-label="Previous preview"
          className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-white/25 transition-colors duration-200 hover:text-white/60 sm:-left-7"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          aria-label="Next preview"
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-white/25 transition-colors duration-200 hover:text-white/60 sm:-right-7"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${slide.nav} preview`}
            aria-current={i === index}
            className="group flex h-4 items-center"
          >
            <span
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                i === index
                  ? 'w-5 bg-primary'
                  : 'w-1.5 bg-white/15 group-hover:bg-white/40',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------- Sidebar ---------------------------------- */

function Sidebar({ active }: { active: NavLabel }) {
  return (
    <aside className="flex w-[150px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c]">
      <div className="flex items-center gap-2 px-4 py-[14px]">
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

      <div className="mx-2.5 mb-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
        {/* Generic default avatar — user's initial in a muted circle. */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.09] font-label text-[10px] font-semibold text-white/70">
          A
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-label text-[11px] font-medium text-white">
            Austin
          </div>
          <span className="font-label text-[8px] font-semibold uppercase tracking-wider text-[#FF6733]">
            Scout+
          </span>
        </div>
        <ChevronDown className="h-3 w-3 shrink-0 text-[#555]" strokeWidth={2} />
      </div>

      <nav className="flex-1 space-y-px px-2">
        {NAV.map(({ label, icon: Icon }) => {
          const isActive = label === active
          return (
            <div
              key={label}
              className={cn(
                'flex items-center gap-2.5 rounded-md py-[7px] pl-2.5 text-[11px] transition-colors duration-300',
                isActive ? 'bg-white/[0.05] text-white' : 'text-[#777]',
              )}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
                  isActive ? 'text-[#FF6733]' : 'text-[#666]',
                )}
                strokeWidth={1.75}
              />
              <span className="font-label font-medium">{label}</span>
            </div>
          )
        })}
      </nav>

      <div className="space-y-2.5 px-2 pb-3">
        <div className="flex items-center gap-2.5 py-[7px] pl-2.5 text-[11px] text-[#777]">
          <Settings className="h-3.5 w-3.5 shrink-0 text-[#666]" strokeWidth={1.75} />
          <span className="font-label font-medium">Settings</span>
        </div>

        <div className="mx-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="font-label text-[7px] font-semibold uppercase tracking-[0.14em] text-[#666]">
              Application Credits
            </span>
            <Info className="h-2.5 w-2.5 text-[#555]" strokeWidth={2} />
          </div>
          <div className="mt-1 font-headline text-[18px] font-semibold leading-none tracking-tight">
            <span className="text-[#FF6733]">589</span>
            <span className="text-[#555]"> / 600</span>
          </div>
          <p className="mt-1 font-body text-[7px] text-[#555]">
            remaining this billing period
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-primary" style={{ width: '98%' }} />
          </div>
        </div>

        <p className="text-center font-label text-[7px] tracking-wider text-[#333]">
          v1.0
        </p>
      </div>
    </aside>
  )
}

function Topbar({ crumb }: { crumb: string[] }) {
  return (
    <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
      <ol className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em]">
        {crumb.map((part, i) => (
          <li key={part} className="flex items-center gap-1">
            {i > 0 ? <span className="text-[#2a2a2a]">/</span> : null}
            <span
              className={cn(
                i === 0
                  ? 'text-[#777]'
                  : i === crumb.length - 1
                    ? 'text-[#555]'
                    : 'text-[#444]',
              )}
            >
              {part}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2.5">
        <Bell className="h-3.5 w-3.5 text-[#666]" strokeWidth={1.75} />
        <span className="inline-flex items-center gap-1 rounded-md border border-primary/70 bg-primary px-2 py-1 font-label text-[9px] font-semibold text-white">
          <Image
            src={scoutLogo}
            alt=""
            width={10}
            height={10}
            draggable={false}
            className="h-2.5 w-auto object-contain"
          />
          Send Scout
        </span>
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
    <div className="flex h-full flex-col gap-3 p-5">
      <header className="space-y-0.5">
        <p className="font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666]">
          Welcome back
        </p>
        <h2 className="font-headline text-[20px] font-medium tracking-[-0.02em] text-white">
          Austin, your dashboard is ready.
        </h2>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        <DashStat label="Scout Score" value="90" subtext="vs. 55 before Scout" />
        <DashStat label="Applied" value="36" />
        <DashStat label="Replies" value="30" subtext="responses received" />
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
        <span className="inline-flex h-8 items-center gap-1 rounded-md border border-primary/70 bg-primary px-3 font-label text-[10px] font-semibold text-primary-foreground">
          View analysis
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </span>
      </section>

      <section className="grid flex-1 grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF6733]/10">
            <Bot className="h-3.5 w-3.5 text-[#FF6733]" strokeWidth={1.75} />
          </span>
          <h3 className="font-headline text-sm font-medium tracking-tight text-white">
            Ask Scout anything
          </h3>
          <p className="font-body text-[11px] leading-snug text-[#999]">
            Your resume, your roles, your gaps — Scout knows it all.
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-body text-[11px] text-[#666]">
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
                {label}
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
}: {
  label: string
  value: string
  subtext?: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <span className="font-label text-[9px] font-medium uppercase tracking-[0.2em] text-[#666]">
        {label}
      </span>
      <div className="mt-1.5 font-headline text-[24px] font-medium leading-none tracking-[-0.03em] text-white">
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
  greenhouse?: boolean
  sponsors?: boolean
  direct?: boolean
}

type FitTone = 'green' | 'orange' | 'muted'

const EXPLORE_COLUMNS: {
  label: string
  tone: FitTone
  count: number
  jobs: JobCard[]
}[] = [
  {
    label: 'Strong fit',
    tone: 'green',
    count: 15,
    jobs: [
      {
        company: 'Tenstorrent University',
        title: 'Mechanical Engineer, Intern',
        location: 'Toronto, Ontario, Canada',
        tags: ['AWS', 'CAD', 'Excel'],
        match: 88,
        greenhouse: true,
        sponsors: true,
      },
      {
        company: 'Endou Corporation',
        title: 'Mechanical Engineering Intern',
        location: 'Saratoga, Santa Clara County',
        tags: ['Remote eligible'],
        match: 87,
        direct: true,
      },
    ],
  },
  {
    label: 'Good fit',
    tone: 'orange',
    count: 20,
    jobs: [
      {
        company: 'Tenstorrent University',
        title: 'AI Compiler Software Intern (PEY)',
        location: 'Toronto, Ontario',
        tags: ['Python', 'C++'],
        match: 63,
        greenhouse: true,
        sponsors: true,
      },
      {
        company: 'Docubank',
        title: 'Data Science PhD Intern',
        location: 'Kirkland, Washington, United States',
        tags: ['Machine Learning', 'Excel'],
        match: 53,
        greenhouse: true,
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
        greenhouse: true,
        sponsors: true,
      },
      {
        company: 'Tenstorrent University',
        title: 'IP Product Operations Intern',
        location: 'Canada +1 more',
        tags: ['AWS'],
        match: 50,
        greenhouse: true,
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
    <div className="flex h-full flex-col gap-3 px-6 pt-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-headline text-[26px] font-medium tracking-[-0.02em] text-white">
            Explore
          </h2>
          <p className="font-body text-[11px] text-[#666]">
            Jobs matched to your resume
          </p>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-label text-[10px] font-medium text-[#bbb]">
            <RefreshCw className="h-3 w-3" strokeWidth={2} />
            Refresh
          </span>
          <div className="flex items-center gap-1.5">
            {['All', 'Remote Only', 'Visa Friendly'].map((f, i) => (
              <span
                key={f}
                className={cn(
                  'rounded-full px-2.5 py-1 font-label text-[10px] font-medium',
                  i === 0
                    ? 'rounded-md border border-primary/70 bg-primary text-primary-foreground'
                    : 'rounded-md border border-white/[0.08] text-[#888]',
                )}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.015] py-3">
        {[
          { n: '15', label: 'Strong fits', tone: 'green' as FitTone },
          { n: '20', label: 'Good fits', tone: 'orange' as FitTone },
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
              className={cn('font-headline text-base font-semibold', FIT_TEXT[t.tone])}
            >
              {t.n}
            </span>
            <span className="font-label text-[10px] uppercase tracking-[0.16em] text-[#777]">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="font-label text-[9px] text-[#666]">15 jobs selected</span>
        <span className="font-label text-[9px] text-[#666]">
          Select all &nbsp; Deselect all
        </span>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-3 overflow-hidden">
        {EXPLORE_COLUMNS.map((col) => (
          <div key={col.label} className="flex min-w-0 flex-col gap-2">
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
  const strong = tone === 'green'
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-2',
        strong
          ? 'border-[#FF6733]/30 bg-[#FF6733]/[0.05]'
          : 'border-white/[0.06] bg-white/[0.02]',
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="truncate font-label text-[7px] font-medium uppercase tracking-[0.14em] text-[#666]">
          {job.company}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              'rounded-full px-1.5 py-px font-label text-[8px] font-semibold',
              tone === 'muted'
                ? 'bg-white/[0.06] text-[#999]'
                : 'bg-emerald-500/15 text-emerald-400',
            )}
          >
            {job.match}% MATCH
          </span>
          <span
            className={cn(
              'flex h-3.5 w-3.5 items-center justify-center rounded-full',
              strong
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

      <p className="flex items-center gap-1 font-body text-[8px] text-[#666]">
        <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
        <span className="truncate">{job.location}</span>
      </p>

      <div className="flex flex-wrap gap-1">
        {job.tags.map((t) => (
          <span
            key={t}
            className="rounded border border-white/[0.08] px-1.5 py-px font-label text-[8px] text-[#999]"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2.5 font-label text-[8px] font-medium">
        {job.greenhouse ? (
          <span className="inline-flex items-center gap-0.5 text-emerald-400">
            <Sprout className="h-2.5 w-2.5" strokeWidth={2} />
            Greenhouse
          </span>
        ) : null}
        {job.direct ? (
          <span className="inline-flex items-center gap-0.5 text-emerald-400">
            <Sprout className="h-2.5 w-2.5" strokeWidth={2} />
            Direct
          </span>
        ) : null}
        {job.sponsors ? (
          <span className="inline-flex items-center gap-0.5 text-emerald-400/80">
            <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
            Sponsors visa
          </span>
        ) : null}
      </div>

      <div className="mt-0.5 flex items-center justify-between border-t border-white/[0.06] pt-1.5">
        <span className="inline-flex items-center gap-0.5 font-label text-[8px] text-[#777]">
          View job
          <ArrowRight className="h-2.5 w-2.5" strokeWidth={2} />
        </span>
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
type TrackerCard = {
  company: string
  role: string
  tag: string
  time?: string
  note?: string
  noteTone?: 'muted' | 'red'
  inProgress?: boolean
  attention?: boolean
  /** Mini version of the tracker's "Cancelled by you" outcome chip. */
  cancelled?: boolean
}

const TRACKER_COLUMNS: {
  label: string
  tone: TrackerTone
  cards: TrackerCard[]
}[] = [
  {
    label: 'Queued',
    tone: 'muted',
    cards: [
      { company: 'Verkada', role: 'Technical Support Engineering Intern', tag: 'VK', time: '3h ago' },
      { company: 'Rocketlab', role: 'Practical Engineering Intern Fall 2026', tag: 'GH', time: '1d ago' },
      { company: 'Astranis', role: 'Member of Technical Staff', tag: 'AS', time: '4d ago' },
    ],
  },
  {
    label: 'In progress',
    tone: 'orange',
    cards: [
      {
        company: 'Microsoft',
        role: 'Software Engineer Intern',
        tag: 'WD',
        note: 'Tailoring résumé…',
        noteTone: 'muted',
        inProgress: true,
      },
    ],
  },
  {
    label: 'Applied',
    tone: 'green',
    cards: [
      { company: 'Google', role: 'Software Engineer Intern', tag: 'GH', time: '2d ago' },
      { company: 'Tesla', role: 'Firmware Engineering Intern', tag: 'LV', time: '4d ago' },
      { company: 'Cisco', role: 'Network Software Intern', tag: 'AS', time: '2d ago' },
    ],
  },
  {
    label: 'Failed',
    tone: 'red',
    cards: [
      {
        company: 'Intel',
        role: 'Hardware Engineering Intern',
        tag: 'GH',
        time: '2d ago',
        cancelled: true,
      },
    ],
  },
  {
    label: 'Attention',
    tone: 'amber',
    cards: [
      {
        company: 'Qualcomm',
        role: 'Embedded Systems Intern',
        tag: 'VK',
        time: '4d ago',
        attention: true,
      },
    ],
  },
]

const TRACKER_TOP: Record<TrackerTone, string> = {
  muted: 'bg-[#555]',
  orange: 'bg-[#FF6733]',
  green: 'bg-emerald-400',
  red: 'bg-red-400',
  amber: 'bg-amber-400',
}
const TRACKER_DOT: Record<TrackerTone, string> = {
  muted: 'text-[#666]',
  orange: 'text-[#FF6733]',
  green: 'text-emerald-400',
  red: 'text-red-400',
  amber: 'text-amber-400',
}

function TrackerSlide() {
  return (
    <div className="flex h-full flex-col px-6 pt-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-label text-[8px] font-semibold uppercase tracking-[0.22em] text-[#666]">
            Scout Agent
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <h2 className="font-headline text-[24px] font-medium tracking-[-0.02em] text-white">
              Run complete
            </h2>
          </div>
          <p className="mt-0.5 font-body text-[10px] text-[#666]">
            Started 2d ago · 7 applications
          </p>
        </div>
        <div className="flex items-start gap-6 pr-1">
          <RunStat value="3" label="Applied" tone="text-emerald-400" />
          <RunStat value="1" label="Failed" tone="text-red-400" />
          <RunStat value="1" label="Attention" tone="text-amber-400" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span className="inline-flex items-center gap-1 font-label text-[8px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Applied
        </span>
        <div className="min-w-0">
          <span className="font-label text-[11px] font-medium text-white">
            NVIDIA
          </span>
          <span className="ml-2 font-body text-[10px] text-[#777]">
            GPU Software Engineer Intern
          </span>
        </div>
        <span className="rounded bg-white/[0.06] px-1.5 py-px font-label text-[8px] text-[#999]">
          GH
        </span>
        <span className="ml-auto font-label text-[9px] text-emerald-400/80">
          Applied 2d ago
        </span>
        <span className="inline-flex items-center gap-0.5 font-label text-[9px] text-[#777]">
          View
          <ArrowRight className="h-2.5 w-2.5" strokeWidth={2} />
        </span>
      </div>

      <p className="mt-4 font-label text-[8px] font-semibold uppercase tracking-[0.22em] text-[#555]">
        Application History
      </p>

      <div className="mt-2 grid flex-1 grid-cols-5 gap-2 overflow-hidden">
        {TRACKER_COLUMNS.map((col) => (
          <div key={col.label} className="flex min-w-0 flex-col">
            <div className={cn('h-0.5 w-full rounded-full', TRACKER_TOP[col.tone])} />
            <div className="mt-1.5 mb-2 flex items-center gap-1">
              <span className={cn('font-label text-[8px]', TRACKER_DOT[col.tone])}>●</span>
              <span className="truncate font-label text-[8px] font-semibold uppercase tracking-[0.1em] text-[#888]">
                {col.label}
              </span>
              <ChevronDown className="ml-auto h-2.5 w-2.5 text-[#555]" strokeWidth={2} />
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
  return (
    <div className="flex flex-col gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] p-2">
      <span className="truncate font-label text-[10px] font-medium text-white">
        {card.company}
      </span>
      <span className="line-clamp-2 font-body text-[8px] leading-tight text-[#777]">
        {card.role}
      </span>
      {card.note ? (
        card.inProgress ? (
          <span className="inline-flex items-center gap-1 font-body text-[8px] italic text-[#888]">
            <Loader2 className="h-2.5 w-2.5 animate-spin text-[#FF6733]" strokeWidth={2} />
            {card.note}
          </span>
        ) : (
          <span
            className={cn(
              'truncate font-mono text-[7px]',
              card.noteTone === 'red' ? 'text-red-400/80' : 'text-[#666]',
            )}
          >
            {card.note}
          </span>
        )
      ) : null}
      {card.cancelled ? (
        <span className="inline-flex w-fit items-center gap-1 rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-label text-[7px] font-medium text-[#999]">
          <CircleSlash className="h-2 w-2 shrink-0" strokeWidth={2} />
          Cancelled by you
        </span>
      ) : null}
      {card.attention ? (
        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-center font-label text-[8px] font-semibold text-amber-400">
          Answer Required
        </span>
      ) : null}
      <div className="mt-0.5 flex items-center justify-between">
        <span className="rounded bg-white/[0.06] px-1 font-label text-[7px] text-[#999]">
          {card.tag}
        </span>
        {card.time ? (
          <span className="font-label text-[7px] text-[#555]">{card.time}</span>
        ) : null}
      </div>
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
    <div className="text-center">
      <div className={cn('font-headline text-[26px] font-semibold leading-none', tone)}>
        {value}
      </div>
      <div className="mt-1 font-label text-[7px] uppercase tracking-[0.16em] text-[#666]">
        {label}
      </div>
    </div>
  )
}

/* ---------------------------------- Resume ---------------------------------- */

const RESUME_BREAKDOWN = [
  { label: 'Experience Quality', value: 21, icon: Briefcase },
  { label: 'Metrics & Impact', value: 23, icon: TrendingUp },
  { label: 'Structure', value: 21, icon: AlignLeft },
  { label: 'Keywords', value: 20, icon: KeyRound },
] as const

const RESUME_FINDINGS = [
  {
    tag: 'RABUOR_DESCRIPTION',
    issue:
      "The 'RateMyRoommate' project uses the generic 'Full-Stack Development' tag rather than specific framework names.",
    fix: 'Explicitly list the specific stack (e.g., PostgreSQL, Node.js) used for the platform.',
  },
  {
    tag: 'MISSING_METRICS',
    issue:
      "The 'RateMyRoommate' bullet regarding 'performance optimization' lacks specific before/after telemetry.",
    fix: "Add a metric like 'improved page load times by 200ms' or 'reduced database query latency by 30%'.",
  },
  {
    tag: 'RABUOR_DESCRIPTION',
    issue:
      "The 'Emerging Scholars Program' bullet on 'applying interdisciplinary problem-solving' is generic.",
    fix: 'Replace with a specific technical accomplishment or tool used within the research context.',
  },
] as const

function ResumeSlide() {
  const score = 85
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)

  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-5 px-6 pt-4">
      <div className="flex flex-col items-center">
        <span className="mb-2 mr-auto inline-flex items-center gap-1 font-label text-[9px] text-[#888]">
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Dashboard
        </span>

        <div className="relative h-[136px] w-[136px]">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="7"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#FF6733"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-headline text-[40px] font-semibold leading-none text-white">
              {score}
            </span>
            <span className="font-body text-[10px] text-[#666]">/ 100</span>
            <span className="mt-0.5 font-label text-[9px] font-semibold uppercase tracking-[0.16em] text-[#FF6733]">
              Strong
            </span>
          </div>
        </div>

        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-label text-[10px] text-[#bbb]">
          Analyzed for: Software Engineering
          <ChevronDown className="h-3 w-3 text-[#777]" strokeWidth={2} />
        </span>

        <div className="mt-5 w-full">
          <p className="mb-2.5 font-label text-[9px] font-semibold uppercase tracking-[0.2em] text-[#888]">
            Score Breakdown
          </p>
          <div className="space-y-2.5">
            {RESUME_BREAKDOWN.map(({ label, value, icon: Icon }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center gap-2 font-label text-[10px]">
                  <Icon className="h-3 w-3 text-[#888]" strokeWidth={1.75} />
                  <span className="text-[#ccc]">{label}</span>
                  <span className="ml-auto text-[#666]">{value} / 25</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${(value / 25) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 overflow-hidden">
        <div>
          <p className="font-label text-[9px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
            What Scout found
          </p>
          <p className="font-body text-[10px] text-[#666]">3 issues detected</p>
        </div>
        {RESUME_FINDINGS.map((f) => (
          <div
            key={f.issue}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 font-label text-[8px] font-semibold uppercase tracking-[0.16em] text-[#FF6733]">
                ● Suggestion
              </span>
              <span className="font-mono text-[7px] uppercase tracking-wider text-[#555]">
                {f.tag}
              </span>
            </div>
            <p className="mt-1.5 font-body text-[11px] leading-snug text-[#ddd]">
              {f.issue}
            </p>
            <p className="mt-2 font-label text-[7px] font-semibold uppercase tracking-[0.16em] text-[#666]">
              How to fix
            </p>
            <div className="mt-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-body text-[10px] leading-snug text-[#999]">
              {f.fix}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
