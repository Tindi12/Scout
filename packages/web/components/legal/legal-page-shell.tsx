import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

type LegalPageShellProps = {
  title: string
  lastUpdated: string
  children: ReactNode
}

export function LegalPageShell({
  title,
  lastUpdated,
  children,
}: LegalPageShellProps) {
  return (
    <div className="relative min-h-screen bg-black">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-40"
          style={{
            background:
              'radial-gradient(circle at center, rgba(255,103,51,0.06) 0%, transparent 65%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

      <header className="border-b border-white/5 px-6 py-6 lg:px-12">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/"
            className="font-label inline-flex items-center gap-2 text-sm font-medium text-[#A1A1AA] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to Scout
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/scout-logo.png"
              alt="Scout"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
            <span className="font-headline text-lg font-semibold tracking-tight text-white">
              Scout
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 pb-32 lg:px-8">
        <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
          Legal
        </p>
        <h1 className="mt-3 font-headline text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
          {title}
        </h1>
        <p className="mt-4 font-body text-sm text-[#888888]">
          Last updated: {lastUpdated}
        </p>

        <div className="font-body mt-14 space-y-12 text-[15px] leading-relaxed text-[#A1A1AA]">
          {children}
        </div>
      </main>
    </div>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-headline border-b border-white/10 pb-3 text-xl font-medium tracking-tight text-white">
        {title}
      </h2>
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  )
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

export function LegalUl({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-[#FF6733]/80">
      {children}
    </ul>
  )
}

export function LegalLi({ children }: { children: ReactNode }) {
  return <li>{children}</li>
}
