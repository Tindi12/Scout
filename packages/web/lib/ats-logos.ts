export type AtsProvider = {
  slug: string
  name: string
  logoUrl: string
  /** Optional img class overrides for dark-UI sizing / contrast. */
  imgClassName?: string
}

/**
 * Brandfetch Logo API client ID. This is a public identifier meant to be
 * embedded directly in <img> src attributes (not a secret). Shared by every
 * Brandfetch-sourced logo in the app (ATS wordmarks).
 */
export const BRANDFETCH_CLIENT_ID = '1iduV7w0HjFvDmytVMh'

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
  {
    slug: 'smartrecruiters',
    name: 'SmartRecruiters',
    // Official current inverse wordmark, cropped to omit the SAP tagline.
    logoUrl: '/ats/smartrecruiters-official-inverse.svg',
    imgClassName: 'h-9 max-w-[92%]',
  },
  {
    slug: 'workable',
    name: 'Workable',
    logoUrl: `https://cdn.brandfetch.io/domain/workable.com/w/800/h/200/logo?c=${BRANDFETCH_CLIENT_ID}`,
  },
  {
    slug: 'bamboohr',
    name: 'BambooHR',
    logoUrl: `https://cdn.brandfetch.io/domain/bamboohr.com/w/800/h/200/logo?c=${BRANDFETCH_CLIENT_ID}`,
  },
  {
    slug: 'icims',
    name: 'iCIMS',
    // Official 2026 white logo, cropped to omit the tagline.
    logoUrl: '/ats/icims-official-white.svg',
    imgClassName: 'h-9 max-w-[82%]',
  },
]
