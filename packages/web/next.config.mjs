import path from 'path'
import { fileURLToPath } from 'url'
import { withSentryConfig } from '@sentry/nextjs'

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ---------------------------------------------------------------------------
// Security headers (Epic 11 hardening)
//
// Applied in PRODUCTION ONLY. Local `next dev` is skipped on purpose: a strict CSP
// plus HSTS/upgrade-insecure-requests breaks the HMR websocket and http://localhost.
// On Vercel, NEXT_PUBLIC_* are present at build time, so the CSP is built against the
// real vendor hosts we actually call (Clerk, Stripe, Supabase, PostHog, Sentry).
// ---------------------------------------------------------------------------
const isProd = process.env.NODE_ENV === 'production'

function originOf(u) {
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}

function wsOriginOf(u) {
  try {
    return `wss://${new URL(u).host}`
  } catch {
    return ''
  }
}

// Clerk encodes its Frontend API host in the publishable key (base64 of "host$" after
// the pk_test_/pk_live_ prefix). Decoding it gives the EXACT Clerk domain for this
// instance (dev *.clerk.accounts.dev or a prod custom domain) so the CSP is correct
// without guessing.
function clerkFrontendApiOrigin(pk) {
  if (!pk) return ''
  try {
    const b64 = pk.replace(/^pk_(test|live)_/, '')
    const decoded = Buffer.from(b64, 'base64').toString('utf8')
    const host = decoded.replace(/\$+$/, '').trim()
    return host ? `https://${host}` : ''
  } catch {
    return ''
  }
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').trim()
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim()
const clerkOrigin = clerkFrontendApiOrigin(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

const CLERK_WILDCARDS = ['https://*.clerk.com', 'https://*.clerk.accounts.dev']
const STRIPE_FRAMES = [
  'https://js.stripe.com',
  'https://hooks.stripe.com',
  'https://checkout.stripe.com',
]

const scriptSrc = [
  "'self'",
  // Next.js injects inline bootstrap/hydration scripts; some vendor SDKs eval. Kept
  // permissive so the app doesn't break — the high-value protections here are
  // frame-ancestors, object-src 'none', base-uri, and the locked-down connect/frame.
  "'unsafe-inline'",
  "'unsafe-eval'",
  ...CLERK_WILDCARDS,
  clerkOrigin,
  'https://challenges.cloudflare.com',
  'https://js.stripe.com',
  'https://*.posthog.com',
  'https://*.i.posthog.com',
].filter(Boolean)

const connectSrc = [
  "'self'",
  ...CLERK_WILDCARDS,
  clerkOrigin,
  originOf(supabaseUrl),
  wsOriginOf(supabaseUrl),
  'https://api.stripe.com',
  originOf(posthogHost),
  'https://*.posthog.com',
  'https://*.i.posthog.com',
  'https://*.sentry.io',
  originOf(apiUrl),
].filter(Boolean)

const frameSrc = [
  "'self'",
  ...CLERK_WILDCARDS,
  clerkOrigin,
  'https://challenges.cloudflare.com',
  ...STRIPE_FRAMES,
].filter(Boolean)

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(' ')}`,
  `frame-src ${frameSrc.join(' ')}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://*.clerk.com",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Scout uses pnpm at the monorepo root; ignore stray lockfiles above packages/web
  // (e.g. C:\Users\<you>\package-lock.json from another project).
  turbopack: {
    root: monorepoRoot,
  },
  async headers() {
    // Production only — see the note above (dev HMR + http://localhost would break).
    if (!isProd) return []
    return [{ source: '/:path*', headers: securityHeaders }]
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
