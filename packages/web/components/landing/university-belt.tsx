import { fetchUniversityLogos, type University } from '@/lib/brandfetch'

function UniversityItem({ uni }: { uni: University }) {
  if (uni.logoUrl) {
    return (
      <div className="flex h-12 w-40 shrink-0 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={uni.logoUrl}
          alt={uni.name}
          loading="lazy"
          draggable={false}
          className="max-h-10 w-auto select-none object-contain opacity-40 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
        />
      </div>
    )
  }

  return (
    <div className="flex h-12 w-40 shrink-0 items-center justify-center">
      <span className="font-label text-sm font-medium uppercase tracking-[0.2em] text-white/40 transition-all duration-300 hover:text-white">
        {uni.name}
      </span>
    </div>
  )
}

export async function UniversityBelt() {
  const universities = await fetchUniversityLogos()
  const doubled = [...universities, ...universities]

  return (
    <section className="relative px-6 py-16 lg:px-12">
      <p className="text-center font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#888888]">
        used by students at
      </p>

      <div className="belt-mask relative mt-10 overflow-hidden">
        <div className="animate-marquee pause-on-hover flex w-max items-center gap-16">
          {doubled.map((uni, i) => (
            <UniversityItem key={`${uni.domain}-${i}`} uni={uni} />
          ))}
        </div>
      </div>
    </section>
  )
}
