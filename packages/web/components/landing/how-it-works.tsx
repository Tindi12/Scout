import { LottiePlayer } from '@/components/landing/lottie-player'

const STEPS = [
  {
    lottieSrc:
      'https://lottie.host/f27a371f-9a8d-443c-94a1-9ddaecd8d509/d1NoxlJrGf.lottie',
    title: 'Parse & Score',
    body:
      'Scout breaks down your experience, side projects, and skills into a structured graph and scores it across four dimensions in seconds.',
    lottieClassName: '',
  },
  {
    lottieSrc:
      'https://lottie.host/fd291262-8330-492e-980c-a7e1dfe79257/K2e6Mz71j3.lottie',
    title: 'Tailor & Optimize',
    body:
      'For every role you target, the agent rewrites your bullets to inject the exact keywords recruiters and ATS scanners look for.',
    lottieClassName: '',
  },
  {
    lottieSrc:
      'https://lottie.host/d39193ca-f545-4d55-b0ff-c718458f55e9/9ehZqE1XUJ.lottie',
    title: 'Autonomous Auto-Apply',
    body:
      'Set your preferences and let Scout submit applications via Greenhouse, Lever, and Workday — the moment new roles drop.',
    // The paper-plane art sits small inside its canvas — scale it up so it
    // reads at the same size as the other two animations.
    lottieClassName: 'scale-[1.55]',
  },
] as const

// Descending staircase offsets (md and up). Visual transforms only, so the
// flex layout boxes stay aligned.
const CARD_OFFSET = ['md:translate-y-0', 'md:translate-y-12', 'md:translate-y-24']

export function HowItWorks() {
  return (
    <section id="about" className="relative px-6 py-32 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            How it works
          </p>
          <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
            The autopilot for your career.
          </h2>
          <p className="mt-5 font-body text-[17px] text-[#A1A1AA]">
            Three steps. Zero busywork. Scout handles the loop from resume to
            recruiter so you can focus on what matters.
          </p>
        </div>

        <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-4 md:mb-24 md:flex-row md:items-start md:gap-8">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className={`glass-card group relative flex-1 basis-0 overflow-hidden rounded-2xl p-7 transition-all duration-300 hover:bg-white/[0.04] ${CARD_OFFSET[i]}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FF6733]/[0.04] blur-3xl transition-opacity duration-500 group-hover:bg-[#FF6733]/10"
              />
              <div className="relative">
                <div className="font-label text-[11px] uppercase tracking-[0.2em] text-[#888888]">
                  0{i + 1}
                </div>
                <div className="mt-4 flex h-28 w-28 items-center justify-center">
                  <LottiePlayer
                    src={step.lottieSrc}
                    className={`h-full w-full ${step.lottieClassName}`}
                  />
                </div>
                <h3 className="mt-6 font-headline text-xl font-medium tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="mt-3 font-body text-[15px] leading-relaxed text-[#A1A1AA]">
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
