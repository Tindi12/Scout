'use client'

const EVENTS = [
  { label: 'Applied', time: '2m' },
  { label: 'Screening', time: '1h' },
  { label: 'Review', time: '3h' },
  { label: 'Match', time: '5h' },
]

export function TimelineWidget() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#555]">
        Activity
      </span>
      <ul className="space-y-1.5">
        {EVENTS.map((ev, i) => (
          <li key={ev.label} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6733]/60" />
            <span
              className="flex-1 truncate font-body text-[10px] text-[#888]"
              style={{ opacity: 0.5 + i * 0.1 }}
            >
              {ev.label}
            </span>
            <span className="font-mono text-[9px] text-[#555]">{ev.time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
