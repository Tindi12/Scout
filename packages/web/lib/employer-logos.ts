import { BRANDFETCH_CLIENT_ID } from './ats-logos'

export type Employer = {
  slug: string
  name: string
  /** Shown in a muted square when the CDN logo fails to load. */
  initials: string
  logoUrl: string
  /** Wordmark-shaped logo (wide) vs square symbol — drives tile sizing. */
  wide?: boolean
}

/**
 * Brandfetch CDN URLs verified per-brand (exact dimensions/theme/type are
 * hand-picked — the generic /symbol endpoint 404s for several of these
 * brands). Consumed by the hero apply animation.
 */
const CDN = `c=${BRANDFETCH_CLIENT_ID}`

export const EMPLOYERS: Employer[] = [
  {
    slug: 'spacex',
    name: 'SpaceX',
    initials: 'SX',
    logoUrl: `https://cdn.brandfetch.io/domain/spacex.com/w/800/h/103/theme/light/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'netflix',
    name: 'Netflix',
    initials: 'N',
    logoUrl: `https://cdn.brandfetch.io/domain/netflix.com/w/800/h/216/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'nvidia',
    name: 'NVIDIA',
    initials: 'NV',
    logoUrl: `https://cdn.brandfetch.io/domain/nvidia.com/w/800/h/148/theme/light/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'tesla',
    name: 'Tesla',
    initials: 'T',
    logoUrl: `https://cdn.brandfetch.io/domain/tesla.com/w/800/h/82/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'apple',
    name: 'Apple',
    initials: 'A',
    logoUrl: `https://cdn.brandfetch.io/domain/apple.com/w/800/h/978/theme/light/logo?${CDN}`,
  },
  {
    slug: 'microsoft',
    name: 'Microsoft',
    initials: 'MS',
    logoUrl: `https://cdn.brandfetch.io/domain/microsoft.com/w/800/h/171/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'amazon',
    name: 'Amazon',
    initials: 'AZ',
    logoUrl: `https://cdn.brandfetch.io/domain/amazon.com/w/800/h/268/theme/light/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'google',
    name: 'Google',
    initials: 'G',
    logoUrl: `https://cdn.brandfetch.io/domain/google.com/w/800/h/253/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'meta',
    name: 'Meta',
    initials: 'M',
    logoUrl: `https://cdn.brandfetch.io/domain/meta.com/w/800/h/345/theme/light/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    initials: 'S',
    logoUrl: `https://cdn.brandfetch.io/domain/stripe.com/w/800/h/380/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'openai',
    name: 'OpenAI',
    initials: 'OA',
    logoUrl: `https://cdn.brandfetch.io/domain/openai.com/w/800/h/695/theme/light/logo?${CDN}`,
  },
  {
    slug: 'palantir',
    name: 'Palantir',
    initials: 'P',
    logoUrl: `https://cdn.brandfetch.io/domain/palantir.com/w/800/h/194/theme/light/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'lockheed-martin',
    name: 'Lockheed Martin',
    initials: 'LM',
    logoUrl: `https://cdn.brandfetch.io/domain/lockheedmartin.com/w/800/h/197/theme/light/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'boeing',
    name: 'Boeing',
    initials: 'B',
    logoUrl: `https://cdn.brandfetch.io/domain/boeing.com/w/820/h/191/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'northrop-grumman',
    name: 'Northrop Grumman',
    initials: 'NG',
    logoUrl: `https://cdn.brandfetch.io/domain/northropgrumman.com/w/800/h/177/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'airbus',
    name: 'Airbus',
    initials: 'AB',
    logoUrl: `https://cdn.brandfetch.io/domain/airbus.com/w/800/h/148/logo?${CDN}`,
    wide: true,
  },
  {
    slug: 'exxonmobil',
    name: 'ExxonMobil',
    initials: 'XM',
    logoUrl: `https://cdn.brandfetch.io/domain/exxonmobil.com/w/800/h/151/logo?${CDN}`,
    wide: true,
  },
]
