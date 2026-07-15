/**
 * Canonical site origin for absolute SEO URLs (sitemap, Open Graph, JSON-LD).
 * Prefer NEXT_PUBLIC_SITE_URL in prod; fall back to the Scout production domain.
 */
export function getSiteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  return 'https://scoutintern.com'
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl()
  if (!path || path === '/') return base
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
