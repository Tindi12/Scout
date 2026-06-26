'use client'

// App Router global error boundary. Catches errors thrown while rendering the root
// layout / pages that the per-route error.tsx boundaries don't handle, and reports
// them to Sentry. Must render its own <html>/<body> because it replaces the root.
import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
