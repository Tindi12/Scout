'use client'

import { Button } from '@/components/ui/button'

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
      <Button type="button" variant="outline" onClick={onRetry} className="mt-6">
        Try again
      </Button>
    </div>
  )
}
