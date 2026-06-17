import { CountUp } from './count-up'

type Stat = {
  label: string
  to: number
  suffix: string
  fallback: string
}

const STATS: Stat[] = [
  {
    label: 'Resumes Optimized',
    to: 2413,
    suffix: '',
    fallback: '2,413',
  },
  {
    label: 'Applications Sent',
    to: 4675,
    suffix: '',
    fallback: '4,675',
  },
  {
    label: 'Interviews Landed',
    to: 1211,
    suffix: '',
    fallback: '1,211',
  },
]

export function Stats() {
  return (
    <section className="relative px-6 py-24 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            Our statistics
          </p>
          <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
            The numbers don&apos;t lie.
          </h2>
          <p className="mt-5 font-body text-[17px] text-[#A1A1AA]">
            We're rapidly growing. Never apply again. Land internships.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center text-center ${
                i > 0
                  ? 'mt-10 border-t border-white/10 pt-10 md:mt-0 md:border-l md:border-t-0 md:pt-0'
                  : ''
              }`}
            >
              <div className="font-headline text-5xl font-medium tracking-[-0.04em] text-white md:text-6xl">
                <CountUp
                  to={stat.to}
                  suffix={stat.suffix}
                  fallback={stat.fallback}
                />
              </div>
              <div className="mt-3 font-label text-sm font-normal text-[#A1A1AA]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
