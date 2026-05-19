import { BarChart3 } from 'lucide-react'

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
          <BarChart3
            className="h-5 w-5 text-[#FF6733]"
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
        <div>
          <h1 className="font-headline text-2xl font-medium tracking-tight text-white">
            Advanced analytics
          </h1>
          <p className="mt-1 font-body text-sm text-[#888]">
            Scout+ — coming soon
          </p>
        </div>
      </div>

      <div className="glass-card mt-8 rounded-2xl border border-white/[0.06] p-8 text-center">
        <p className="font-body text-sm leading-relaxed text-[#999]">
          Application funnel, match quality, and Scout run performance will
          live here. This page is a placeholder while we build the full
          dashboard.
        </p>
      </div>
    </div>
  )
}
