import { BookOpen, Briefcase, Globe, GraduationCap } from 'lucide-react'

import { LANDING_CPT_OPT_EMPLOYER_COUNT } from '@/lib/landing-stats'

const FEATURES = [
  {
    title: 'Filter by visa status',
    body:
      'Set F-1, OPT, or CPT once—Scout hides roles that are not a match for how you can work.',
  },
  {
    title: 'Sponsorship signals on every role',
    body:
      'Each internship is tagged so you see sponsorship posture before you spend time on an application.',
  },
  {
    title: 'Consistent answers on forms',
    body:
      'Work authorization and visa fields get filled from your profile, not guesswork.',
  },
] as const

const STATUS_ROWS = [
  {
    icon: GraduationCap,
    title: 'F-1 Students',
    detail:
      'Scout supports internship matching for international students on F-1 visas.',
    tone: 'emerald' as const,
    badge: 'In product',
  },
  {
    icon: Briefcase,
    title: 'OPT',
    detail: 'Pre & post-completion',
    tone: 'emerald' as const,
    badge: 'In product',
  },
  {
    icon: BookOpen,
    title: 'CPT',
    detail: 'Curricular Practical Training',
    tone: 'emerald' as const,
    badge: 'In product',
  },
  {
    icon: Globe,
    title: 'H-1B sponsorship intel',
    detail: 'Company-level sponsorship cues from our dataset',
    tone: 'orange' as const,
    badge: 'Expanding',
  },
] as const

export function InternationalStudents() {
  return (
    <section id="international" className="relative px-6 py-32 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
              International students
            </p>
            <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
              Built for international students too.
            </h2>
            <p className="mt-5 max-w-xl font-body text-[17px] leading-relaxed text-[#A1A1AA]">
              The job search is different on F-1. Scout tags internships with
              sponsorship context so you can focus on roles that fit how you
              actually work in the US.
            </p>

            <ul className="mt-12 space-y-10">
              {FEATURES.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="mt-1 h-px w-8 shrink-0 bg-white/10"
                  />
                  <div>
                    <h3 className="font-headline text-lg font-medium tracking-tight text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 font-body text-[15px] leading-relaxed text-[#A1A1AA]">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card relative overflow-hidden rounded-2xl p-8">
            <div className="relative">
              <p className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#888888]">
                What Scout covers
              </p>

              <div className="mt-8 divide-y divide-white/10">
                {STATUS_ROWS.map((row) => {
                  const Icon = row.icon
                  const isOrange = row.tone === 'orange'
                  return (
                    <div
                      key={row.title}
                      className="flex items-start justify-between gap-4 py-5 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/[0.03] backdrop-blur-md ${
                            isOrange
                              ? 'border-[#FF6733]/35'
                              : 'border-white/10'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${
                              isOrange ? 'text-[#FF6733]' : 'text-emerald-400'
                            }`}
                            strokeWidth={1.75}
                          />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <div className="font-headline text-[15px] font-medium text-white">
                            {row.title}
                          </div>
                          {row.detail ? (
                            <p className="mt-1 font-body text-[13px] leading-relaxed text-[#888888]">
                              {row.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 font-label text-[10px] font-semibold uppercase tracking-[0.15em] ${
                          isOrange
                            ? 'text-[#FF6733]'
                            : 'text-emerald-400/90'
                        }`}
                      >
                        {row.badge}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-10 border-t border-white/10 pt-10">
                <div className="font-headline text-5xl font-medium tracking-[-0.04em] text-white md:text-6xl">
                  {LANDING_CPT_OPT_EMPLOYER_COUNT.toLocaleString()}+
                </div>
                <p className="mt-3 font-label text-sm font-normal text-[#A1A1AA]">
                  employers flagged as CPT/OPT-friendly in our dataset
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
