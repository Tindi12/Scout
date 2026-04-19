const STATS = [
  { value: '10k+', label: 'Resumes Optimized' },
  { value: '50k+', label: 'Applications Sent' },
  { value: '1,200+', label: 'Interviews Landed' },
] as const

export function Stats() {
  return (
    <section className="relative px-6 py-24 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center text-center md:items-start md:text-left ${
                i > 0
                  ? 'mt-10 border-t border-white/10 pt-10 md:mt-0 md:border-l md:border-t-0 md:pl-12 md:pt-0'
                  : ''
              }`}
            >
              <div className="font-headline text-5xl font-medium tracking-[-0.04em] text-white md:text-6xl">
                {stat.value}
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
