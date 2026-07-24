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
    <section
      id="international"
      className="relative px-4 py-10 sm:px-6 sm:py-16 lg:px-12 lg:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-start gap-8 sm:gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
              International students
            </p>
            <h2 className="mt-2.5 font-headline text-[1.375rem] font-medium leading-snug tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl md:text-5xl">
              Built for international students too.
            </h2>
            <p className="mt-2.5 max-w-xl font-body text-[14px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-[17px]">
              The job search is different on F-1. Scout tags internships with
              sponsorship context so you can focus on roles that fit how you
              actually work in the US.
            </p>

            <ul className="mt-6 space-y-5 sm:mt-12 sm:space-y-10">
              {FEATURES.map((item) => (
                <li key={item.title} className="flex gap-3 sm:gap-4">
                  <span
                    aria-hidden
                    className="mt-1.5 h-px w-6 shrink-0 bg-white/10 sm:mt-1 sm:w-8"
                  />
                  <div>
                    <h3 className="font-headline text-[15px] font-medium tracking-tight text-white sm:text-lg">
                      {item.title}
                    </h3>
                    <p className="mt-1 font-body text-[13.5px] leading-relaxed text-[#A1A1AA] sm:mt-2 sm:text-[15px]">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card relative overflow-hidden rounded-xl p-4 sm:rounded-2xl sm:p-8">
            <div className="relative">
              <p className="font-label text-[10px] font-semibold uppercase tracking-[0.18em] text-[#888888] sm:text-[11px] sm:tracking-[0.2em]">
                What Scout covers
              </p>

              <div className="mt-4 divide-y divide-white/10 sm:mt-8">
                {STATUS_ROWS.map((row) => {
                  const Icon = row.icon
                  const isOrange = row.tone === 'orange'
                  return (
                    <div
                      key={row.title}
                      className="flex items-start justify-between gap-2.5 py-3 first:pt-0 last:pb-0 sm:gap-4 sm:py-5"
                    >
                      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white/[0.03] backdrop-blur-md sm:h-10 sm:w-10 sm:rounded-xl ${
                            isOrange
                              ? 'border-[#FF6733]/35'
                              : 'border-white/10'
                          }`}
                        >
                          <Icon
                            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                              isOrange ? 'text-[#FF6733]' : 'text-emerald-400'
                            }`}
                            strokeWidth={1.75}
                          />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <div className="font-headline text-[13.5px] font-medium text-white sm:text-[15px]">
                            {row.title}
                          </div>
                          {row.detail ? (
                            <p className="mt-0.5 font-body text-[11.5px] leading-relaxed text-[#888888] sm:mt-1 sm:text-[13px]">
                              {row.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 pt-0.5 font-label text-[9px] font-semibold uppercase tracking-[0.12em] sm:text-[10px] sm:tracking-[0.15em] ${
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

              <div className="mt-5 border-t border-white/10 pt-5 sm:mt-10 sm:pt-10">
                <div className="font-headline text-3xl font-medium tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
                  {LANDING_CPT_OPT_EMPLOYER_COUNT.toLocaleString()}+
                </div>
                <p className="mt-1.5 font-label text-[13px] font-normal text-[#A1A1AA] sm:mt-3 sm:text-sm">
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
