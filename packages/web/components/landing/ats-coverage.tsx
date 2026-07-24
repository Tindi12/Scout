import { ATS_PROVIDERS, type AtsProvider } from '@/lib/ats-logos'
import { cn } from '@/lib/utils'

function AtsTile({ ats }: { ats: AtsProvider }) {
  return (
    <div className="glass-card group relative flex h-14 items-center justify-center overflow-hidden rounded-xl p-3 transition-all duration-300 hover:bg-white/[0.04] sm:h-28 sm:rounded-2xl sm:p-6">
      <div className="flex h-8 w-full items-center justify-center sm:h-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ats.logoUrl}
          alt={ats.name}
          loading="lazy"
          draggable={false}
          className={cn(
            'relative mx-auto block h-6 w-auto max-w-[75%] select-none object-contain opacity-80 transition-opacity duration-300 group-hover:opacity-100 sm:h-8',
            ats.imgClassName,
          )}
        />
      </div>
    </div>
  )
}

export function AtsCoverage() {
  return (
    <section id="ats" className="relative px-4 py-10 sm:px-6 sm:py-16 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-7 max-w-3xl text-center sm:mb-14">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-[#FF6733] sm:text-[12px] sm:tracking-[0.2em]">
            Coverage
          </p>
          <h2 className="mt-2.5 font-headline text-[1.375rem] font-medium leading-snug tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl md:text-5xl">
            Every ATS that matters.
          </h2>
          <p className="mt-2.5 font-body text-[14px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-[17px]">
            Scout applies through the major engineering and computer science
            internship platforms — the same systems the top employers screen on.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-2.5 sm:gap-6 md:grid-cols-4">
          {ATS_PROVIDERS.map((ats) => (
            <AtsTile key={ats.slug} ats={ats} />
          ))}
        </div>
      </div>
    </section>
  )
}
