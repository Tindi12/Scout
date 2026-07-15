'use client'

type ProgressRingWidgetProps = {
  active?: boolean
}

export function ProgressRingWidget({ active }: ProgressRingWidgetProps) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="flex h-full items-center gap-3 p-3">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90" aria-hidden>
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="4"
          />
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke="#FF6733"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * 0.35}
            className={active ? 'analytics-ring-fill' : ''}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[#888]">
          68%
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-wider text-[#555]">
          Pipeline
        </p>
        <p className="mt-0.5 font-body text-xs text-[#999]">Building…</p>
      </div>
    </div>
  )
}
