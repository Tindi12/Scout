import { LottiePlayer } from '@/components/landing/lottie-player'

const STEPS = [
  {
    // Self-hosted — prod CSP blocks third-party connect-src (lottie.host), and
    // remote CDN outages blanked this section on Vercel.
    lottieSrc: '/lottie/parse-score.lottie',
    title: 'Parse & Score',
    body:
      'Scout breaks down your experience, side projects, and skills into a structured graph and scores it across four dimensions in seconds.',
    lottieClassName: '',
  },
  {
    lottieSrc: '/lottie/tailor-optimize.lottie',
    title: 'Tailor & Optimize',
    body:
      'For every role you target, the agent rewrites your bullets to inject the exact keywords recruiters and ATS scanners look for.',
    lottieClassName: '',
  },
  {
    lottieSrc: '/lottie/auto-apply.lottie',
    title: 'Autonomous Auto-Apply',
    body:
      'Set your preferences and let Scout submit applications via Greenhouse, Lever, and Workday — the moment new roles drop.',
    // The paper-plane art sits small inside its canvas — scale it up so it
    // reads at the same size as the other two animations. Mobile uses a
    // gentler scale to avoid clipping inside overflow-hidden cards.
    lottieClassName: 'scale-[1.15] sm:scale-[1.55]',
  },
] as const

// Descending staircase offsets (md and up). Visual transforms only, so the
// flex layout boxes stay aligned.
const CARD_OFFSET = ['md:translate-y-0', 'md:translate-y-12', 'md:translate-y-24']

export function HowItWorks() {
  return (
    <section id="about" className="relative px-4 py-10 sm:px-6 sm:py-16 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-7 max-w-3xl text-center sm:mb-14">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
            How it works
          </p>
          <h2 className="mt-2.5 font-headline text-[1.375rem] font-medium leading-snug tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl md:text-5xl">
            The autopilot for your career.
          </h2>
          <p className="mt-2.5 font-body text-[14px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-[17px]">
            Three steps. Zero busywork. Scout handles the loop from resume to
            recruiter so you can focus on what matters.
          </p>
        </div>

        {/* Mobile: compact horizontal step rows (desktop cards stay in DOM but hidden) */}
        <div className="mx-auto flex max-w-5xl flex-col gap-2.5 md:hidden">
          {STEPS.map((step, i) => (
            <div
              key={`m-${step.title}`}
              className="glass-card flex items-start gap-3.5 overflow-hidden rounded-xl p-3.5"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center">
                <LottiePlayer
                  src={step.lottieSrc}
                  className={`h-full w-full ${step.lottieClassName}`}
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-label text-[10px] uppercase tracking-[0.18em] text-[#888888]">
                    0{i + 1}
                  </span>
                  <h3 className="font-headline text-[15px] font-medium tracking-tight text-white">
                    {step.title}
                  </h3>
                </div>
                <p className="mt-1 font-body text-[13px] leading-relaxed text-[#A1A1AA]">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop / tablet: staircase cards */}
        <div className="mx-auto hidden max-w-5xl flex-col items-stretch gap-3 sm:gap-4 md:mb-24 md:flex md:flex-row md:items-start md:gap-8">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className={`glass-card group relative flex-1 basis-0 overflow-hidden rounded-xl p-5 transition-all duration-300 hover:bg-white/[0.04] sm:rounded-2xl sm:p-7 ${CARD_OFFSET[i]}`}
            >
              <div className="relative">
                <div className="font-label text-[11px] uppercase tracking-[0.2em] text-[#888888]">
                  0{i + 1}
                </div>
                <div className="mt-3 flex h-24 w-24 items-center justify-center sm:mt-4 sm:h-28 sm:w-28">
                  <LottiePlayer
                    src={step.lottieSrc}
                    className={`h-full w-full ${step.lottieClassName}`}
                  />
                </div>
                <h3 className="mt-4 font-headline text-lg font-medium tracking-tight text-white sm:mt-6 sm:text-xl">
                  {step.title}
                </h3>
                <p className="mt-2 font-body text-[14px] leading-relaxed text-[#A1A1AA] sm:mt-3 sm:text-[15px]">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
