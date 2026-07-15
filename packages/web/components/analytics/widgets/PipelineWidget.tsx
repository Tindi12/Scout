'use client'

const COLS = ['Queued', 'Active', 'Done']

export function PipelineWidget() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#555]">
        Applications
      </span>
      <div className="flex flex-1 gap-1.5">
        {COLS.map((col) => (
          <div
            key={col}
            className="flex flex-1 flex-col gap-1 rounded-md bg-white/[0.02] p-1"
          >
            <span className="truncate font-mono text-[8px] text-[#444]">{col}</span>
            {[0, 1].map((card) => (
              <div
                key={card}
                className="h-4 rounded border border-white/[0.06] bg-white/[0.03]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
