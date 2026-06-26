import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ncaa-api.henrygd.me',
      },
    ],
  },
  // instrumentation.ts runs automatically on Next 15 (the instrumentation hook is
  // stable — no experimental flag needed).
}

// withSentryConfig wires up source-map upload (when SENTRY_AUTH_TOKEN is set at build
// time on Vercel) and the build-time instrumentation. It is inert at runtime when no
// DSN is configured, so local dev is unaffected.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Don't fail the build if source-map upload can't run (e.g. no auth token locally).
  errorHandler: () => {},
  // Route Sentry's browser requests through a same-origin tunnel to dodge ad blockers.
  tunnelRoute: '/monitoring',
  // Strip Sentry SDK logger statements from the production (webpack) build. Replaces
  // the deprecated top-level `disableLogger`. (No-op under Turbopack dev — the
  // production `next build` uses webpack, where this applies.)
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
})
