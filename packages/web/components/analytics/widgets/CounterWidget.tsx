'use client'

import { CountUp } from '@/components/landing/count-up'

type CounterWidgetProps = {
  active?: boolean
}

export function CounterWidget({ active }: CounterWidgetProps) {
  return (
    <div className="flex h-full flex-col justify-center p-3">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#555]">
        Applications
      </span>
      <p
        className={`mt-1 font-headline text-xl font-medium tabular-nums text-white ${
          active ? 'text-[#FF6733]' : ''
        }`}
      >
        <CountUp to={247} duration={2.8} fallback="247" />
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-[#FF6733] to-[#22c55e] ${
            active ? 'analytics-bar-fill' : 'w-[60%]'
          }`}
        />
      </div>
    </div>
  )
}
