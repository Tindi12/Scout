'use client'

type TrackerFetchErrorProps = {
  message: string
  onRetry: () => void
}

export function TrackerFetchError({ message, onRetry }: TrackerFetchErrorProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-headline text-xl font-medium text-white">
        Could not load applications
      </p>
      <p className="mt-2 max-w-sm font-body text-sm text-[#555]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.06]"
      >
        Try again
      </button>
    </div>
  )
}
