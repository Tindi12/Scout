import Image from 'next/image'
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  CircleDashed,
  Compass,
  FileText,
  LayoutDashboard,
  Upload,
  User,
} from 'lucide-react'

import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Resume', icon: FileText, active: false },
  { label: 'Jobs', icon: Compass, active: false },
  { label: 'Tracker', icon: Activity, active: false },
  { label: 'Copilot', icon: Bot, active: false },
  { label: 'Profile', icon: User, active: false },
] as const

const QUICK_ACTIONS = [
  'View your matched jobs',
  'Check role alignment',
  'Track your applications',
  'Optimize your resume',
] as const

export function LandingDashboardShowcase() {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080808] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
    >
      <div className="flex min-h-[320px] sm:min-h-[360px]">
        <aside className="hidden w-[168px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0a] sm:flex">
          <div className="flex items-center gap-2 px-4 pb-3 pt-4">
            <Image
              src={scoutLogo}
              alt=""
              width={24}
              height={24}
              draggable={false}
              className="h-6 w-6 object-contain"
            />
            <span className="font-headline text-[15px] font-semibold tracking-tight text-white">
              Scout
            </span>
          </div>

          <div className="mx-2.5 mb-3 flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF6733]/15 text-[10px] font-medium text-[#FF6733]">
              AD
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-label text-[12px] font-medium text-white">
                Adam
              </div>
              <span className="mt-0.5 inline-flex rounded-full bg-white/[0.06] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[#888]">
                Free
              </span>
            </div>
          </div>

          <nav className="flex-1 space-y-0.5 py-1">
            {NAV.map(({ label, icon: Icon, active }) => (
              <div
                key={label}
                className={cn(
                  'flex items-center gap-2.5 border-l-2 px-3.5 py-2 text-[12px]',
                  active
                    ? 'border-[#FF6733] bg-[#FF6733]/5 text-white'
                    : 'border-transparent text-[#666]',
                )}
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    active ? 'text-[#FF6733]' : 'text-[#555]',
                  )}
                  strokeWidth={1.75}
                />
                <span className="font-label font-medium">{label}</span>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 items-center justify-between gap-3 border-b border-white/[0.06] px-4 sm:px-5">
            <ol className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#444] sm:text-[10px]">
              <li>SCOUT</li>
              <li className="text-[#2a2a2a]">/</li>
              <li className="text-[#666]">DASHBOARD</li>
            </ol>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-[#888]">
                <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6733]/30 bg-[#FF6733]/10 px-2.5 py-1 text-[10px] font-medium text-[#FF6733] sm:text-[11px]">
                <Image
                  src={scoutLogo}
                  alt=""
                  width={16}
                  height={16}
                  draggable={false}
                  className="h-3.5 w-auto object-contain"
                />
                Send Scout
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-4 sm:gap-3.5 sm:p-5">
            <header className="space-y-0.5">
              <p className="font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666] sm:text-[10px]">
                Welcome back
              </p>
              <h2 className="font-headline text-lg font-medium tracking-[-0.02em] text-white sm:text-xl">
                Adam, your dashboard is ready.
              </h2>
            </header>

            <section className="grid grid-cols-3 gap-2 sm:gap-2.5">
              <Stat label="Scout Score" value="90" subtext="vs. 55 before Scout" />
              <Stat label="Applied" value="36" />
              <Stat label="Replies" value="30" subtext="responses received" />
            </section>

            <section className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FF6733]/10">
                  <FileText
                    className="h-4 w-4 text-[#FF6733]"
                    strokeWidth={1.5}
                  />
                </span>
                <div>
                  <p className="font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666] sm:text-[10px]">
                    Resume Score
                  </p>
                  <p className="font-headline text-base font-medium tracking-tight text-white sm:text-lg">
                    90
                    <span className="ml-1 font-body text-xs text-[#666]">
                      / 100
                    </span>
                  </p>
                </div>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 font-label text-[10px] font-semibold text-[#bbb]">
                  <Upload className="h-3 w-3" strokeWidth={2} />
                  Upload now
                </span>
                <span className="inline-flex h-8 items-center gap-1 rounded-full bg-[#FF6733] px-3 font-label text-[10px] font-semibold text-white shadow-[0_0_14px_rgba(255,103,51,0.35)]">
                  View analysis
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </span>
              </div>
            </section>

            <section className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
              <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6733]/10">
                  <Bot className="h-4 w-4 text-[#FF6733]" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="font-headline text-sm font-medium tracking-tight text-white sm:text-base">
                    Ask Scout anything
                  </h3>
                  <p className="mt-0.5 font-body text-[11px] leading-snug text-[#999] sm:text-xs">
                    Your resume, your roles, your gaps — Scout knows it all.
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-body text-[11px] text-[#666] sm:text-xs">
                  <span>Am I ready for Stripe?</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-3.5">
                <h3 className="mb-2 font-label text-[9px] font-medium uppercase tracking-[0.22em] text-[#666] sm:text-[10px]">
                  Quick actions
                </h3>
                <ul className="space-y-0.5">
                  {QUICK_ACTIONS.map((label) => (
                    <li
                      key={label}
                      className="flex items-center justify-between gap-2 py-1.5 font-body text-[11px] text-[#999] sm:text-xs"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <CircleDashed
                          className="h-3 w-3 text-[#444]"
                          strokeWidth={2}
                        />
                        {label}
                      </span>
                      <ArrowRight
                        className="h-3 w-3 text-[#444]"
                        strokeWidth={2}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  subtext,
  valueMuted,
}: {
  label: string
  value: string
  subtext?: string
  valueMuted?: boolean
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 sm:p-3">
      <span className="font-label text-[8px] font-medium uppercase tracking-[0.2em] text-[#666] sm:text-[9px]">
        {label}
      </span>
      <div
        className={cn(
          'mt-1.5 font-headline text-2xl font-medium leading-none tracking-[-0.03em] sm:text-[28px]',
          valueMuted ? 'text-[#444]' : 'text-white',
        )}
      >
        {value}
      </div>
      {subtext ? (
        <span className="mt-1.5 font-body text-[9px] text-[#666] sm:text-[10px]">
          {subtext}
        </span>
      ) : (
        <span className="mt-1.5 block h-[12px]" />
      )}
    </div>
  )
}
