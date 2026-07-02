import { getUniversityLogos, type University } from '@/lib/ncaa-logos'

function UniversityItem({ uni }: { uni: University }) {
  return (
    <div className="flex shrink-0 items-center gap-3.5">
      {uni.logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={uni.logoUrl}
          alt={uni.name}
          loading="lazy"
          draggable={false}
          className="h-8 w-auto select-none object-contain"
        />
      ) : null}
      <span className="font-label text-sm font-medium tracking-wide text-white/90">
        {uni.name}
      </span>
    </div>
  )
}

export function UniversityBelt() {
  const universities = getUniversityLogos()
  const doubled = [...universities, ...universities]

  return (
    <section className="relative px-6 py-16 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#888888]">
          used by students at
        </p>

        <div className="belt-mask relative mt-10 overflow-hidden">
          <div className="animate-marquee pause-on-hover flex w-max items-center gap-20">
            {doubled.map((uni, i) => (
              <UniversityItem key={`${uni.slug ?? uni.name}-${i}`} uni={uni} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
