'use client'

type LineChartWidgetProps = {
  active?: boolean
}

export function LineChartWidget({ active }: LineChartWidgetProps) {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#555]">
          Match trend
        </span>
        {active ? (
          <span className="text-[10px] text-[#22c55e]">✓</span>
        ) : null}
      </div>
      <svg viewBox="0 0 120 48" className="h-12 w-full" aria-hidden>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6733" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FF6733" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 40 L20 32 L40 36 L60 20 L80 24 L100 12 L120 16 L120 48 L0 48 Z"
          fill="url(#chartFill)"
          className={active ? 'animate-pulse' : ''}
        />
        <polyline
          points="0,40 20,32 40,36 60,20 80,24 100,12 120,16"
          fill="none"
          stroke="#FF6733"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="200"
          className="analytics-chart-line"
        />
      </svg>
    </div>
  )
}
