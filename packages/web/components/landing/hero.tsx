import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden px-6 pb-32 pt-40 lg:px-12 lg:pt-48"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[700px] w-[900px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255,103,51,0.10) 0%, rgba(255,103,51,0.04) 35%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-80 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />

      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]" />
          </span>
          <span className="font-label text-sm font-medium tracking-wide text-white/90">
            Scout 1.0 is now live
          </span>
        </div>

        <h1 className="font-headline text-[clamp(2.75rem,6vw,5.25rem)] font-medium leading-[1.05] tracking-[-0.04em] text-white">
          Land your dream internship
          <br className="hidden md:block" />{' '}
          <span className="text-white/95">while you sleep.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-balance font-body text-[18px] leading-relaxed tracking-[0.005em] text-[#A1A1AA]">
          Scout reads your resume, tailors it to every role it finds, and
          autonomously applies on your behalf. Stop filling out forms. Start
          interviewing.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            prefetch
            className="font-label group inline-flex items-center justify-center gap-2 rounded-full bg-[#FF6733] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(255,103,51,0.35)] transition-all duration-200 hover:shadow-[0_0_56px_rgba(255,103,51,0.55)] active:scale-[0.97]"
          >
            Try Scout Now
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#about"
            className="font-label inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:bg-white/[0.08]"
          >
            See how it works
          </Link>
        </div>
      </div>

      <div className="relative mx-auto mt-24 max-w-6xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-12 -top-10 h-40 -z-10 rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,103,51,0.18) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            </div>
            <div className="ml-2 font-label text-[11px] uppercase tracking-[0.15em] text-[#888888]">
              scout / dashboard
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 p-6">
            <aside className="col-span-3 hidden flex-col gap-2 md:flex">
              {['Dashboard', 'Resume', 'Roles', 'Tracker', 'Copilot'].map(
                (item, i) => (
                  <div
                    key={item}
                    className={`rounded-xl px-3 py-2.5 font-label text-[13px] ${
                      i === 0
                        ? 'glass-card-strong text-white'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    {item}
                  </div>
                ),
              )}
            </aside>

            <div className="col-span-12 flex flex-col gap-4 md:col-span-9">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-label text-[11px] uppercase tracking-widest text-[#888888]">
                    Welcome back
                  </div>
                  <div className="font-headline text-2xl font-medium tracking-tight text-white">
                    Adam, you have 12 strong fits today.
                  </div>
                </div>
                <button
                  type="button"
                  className="group/send hidden items-center gap-2 rounded-full border border-[#FF6733]/30 bg-[#FF6733]/10 px-3.5 py-1.5 text-[12px] font-medium text-[#FF6733] transition-all duration-300 hover:scale-105 hover:border-[#FF6733]/70 hover:bg-[#FF6733]/20 hover:shadow-[0_0_20px_rgba(255,103,51,0.35)] sm:inline-flex"
                >
                  <Image
                    src="/scout-logo.png"
                    alt=""
                    width={20}
                    height={20}
                    draggable={false}
                    className="h-4 w-auto select-none object-contain"
                  />
                  Send Scout
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <div className="glass-card-strong rounded-xl p-4">
                  <div className="font-label text-[11px] uppercase tracking-widest text-[#888888]">
                    Scout Score
                  </div>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="font-headline text-3xl font-medium tracking-tight text-white">
                      87
                    </span>
                    <span className="mb-1 text-[12px] text-emerald-400">
                      +45
                    </span>
                  </div>
                </div>
                <div className="glass-card-strong rounded-xl p-4">
                  <div className="font-label text-[11px] uppercase tracking-widest text-[#888888]">
                    Applied
                  </div>
                  <div className="mt-2 font-headline text-3xl font-medium tracking-tight text-white">
                    23
                  </div>
                </div>
                <div className="glass-card-strong rounded-xl p-4">
                  <div className="font-label text-[11px] uppercase tracking-widest text-[#888888]">
                    Replies
                  </div>
                  <div className="mt-2 font-headline text-3xl font-medium tracking-tight text-[#FF6733]">
                    7
                  </div>
                </div>
              </div>

              <div className="glass-card-strong rounded-xl p-5">
                <div className="font-label text-[11px] uppercase tracking-widest text-[#888888]">
                  Live agent run
                </div>
                <div className="mt-3 space-y-2.5">
                  {[
                    {
                      label: 'Stripe — SWE Intern',
                      status: 'Submitted',
                      tone: 'emerald',
                    },
                    {
                      label: 'Linear — Product Eng',
                      status: 'Filling form',
                      tone: 'orange',
                    },
                    {
                      label: 'Vercel — DX Intern',
                      status: 'Queued',
                      tone: 'muted',
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between text-[13px]"
                    >
                      <span className="text-white/90">{row.label}</span>
                      <span
                        className={`font-label text-[11px] uppercase tracking-widest ${
                          row.tone === 'emerald'
                            ? 'text-emerald-400'
                            : row.tone === 'orange'
                              ? 'text-[#FF6733]'
                              : 'text-[#888888]'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-10 h-32 bg-gradient-to-t from-black to-transparent"
        />
      </div>
    </section>
  )
}
