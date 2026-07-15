import { ATS_PROVIDERS, type AtsProvider } from '@/lib/ats-logos'
import { cn } from '@/lib/utils'

function AtsTile({ ats }: { ats: AtsProvider }) {
  return (
    <div className="glass-card group relative flex h-28 items-center justify-center overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:bg-white/[0.04]">
      <div className="flex h-12 w-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ats.logoUrl}
          alt={ats.name}
          loading="lazy"
          draggable={false}
          className={cn(
            'relative mx-auto block h-8 w-auto max-w-[75%] select-none object-contain opacity-80 transition-opacity duration-300 group-hover:opacity-100',
            ats.imgClassName,
          )}
        />
      </div>
    </div>
  )
}

export function AtsCoverage() {
  return (
    <section id="ats" className="relative px-6 py-32 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            Coverage
          </p>
          <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
            Every ATS that matters.
          </h2>
          <p className="mt-5 font-body text-[17px] text-[#A1A1AA]">
            Scout applies through the major engineering and computer science
            internship platforms — the same systems the top employers screen on.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
          {ATS_PROVIDERS.map((ats) => (
            <AtsTile key={ats.slug} ats={ats} />
          ))}
        </div>
      </div>
    </section>
  )
}
