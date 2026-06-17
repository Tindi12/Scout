export type AtsProvider = {
  slug: string
  name: string
  logoUrl: string
}

/**
 * Brandfetch Logo API client ID. This is a public identifier meant to be
 * embedded directly in <img> src attributes (not a secret).
 */
const BRANDFETCH_CLIENT_ID = '1iduV7w0HjFvDmytVMh'

/**
 * ATS platforms Scout submits applications through. Logos come straight from
 * the Brandfetch Logo CDN — per-brand dimensions/theme are tuned so each
 * wordmark reads well on Scout's dark UI.
 */
export const ATS_PROVIDERS: AtsProvider[] = [
  {
    slug: 'ashby',
    name: 'Ashby',
    logoUrl: `https://cdn.brandfetch.io/domain/ashbyhq.com/w/800/h/262/theme/light/logo?c=${BRANDFETCH_CLIENT_ID}`,
  },
  {
    slug: 'workday',
    name: 'Workday',
    logoUrl: `https://cdn.brandfetch.io/domain/workday.com/w/800/h/378/logo?c=${BRANDFETCH_CLIENT_ID}`,
  },
  {
    slug: 'greenhouse',
    name: 'Greenhouse',
    logoUrl: `https://cdn.brandfetch.io/domain/greenhouse.com/w/800/h/179/logo?c=${BRANDFETCH_CLIENT_ID}`,
  },
  {
    slug: 'lever',
    name: 'Lever',
    logoUrl: `https://cdn.brandfetch.io/domain/lever.co/w/768/h/190/logo?c=${BRANDFETCH_CLIENT_ID}`,
  },
]
