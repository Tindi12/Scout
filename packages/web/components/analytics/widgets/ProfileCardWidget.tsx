'use client'

export function ProfileCardWidget() {
  return (
    <div className="flex h-full items-center gap-2.5 p-3">
      <div className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06]" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-2 w-16 rounded bg-white/[0.08]" />
        <div className="h-1.5 w-24 rounded bg-white/[0.04]" />
        <div className="h-1.5 w-20 rounded bg-white/[0.03]" />
      </div>
    </div>
  )
}
