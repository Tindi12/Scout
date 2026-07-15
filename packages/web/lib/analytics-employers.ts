import { EMPLOYERS, type Employer } from './employer-logos'

const ANALYTICS_SLUGS = [
  'spacex',
  'netflix',
  'google',
  'apple',
  'microsoft',
  'nvidia',
  'tesla',
  'openai',
  'stripe',
  'amazon',
] as const

/** Curated employer logos for the Analytics Mission Control scene. */
export const ANALYTICS_EMPLOYERS: Employer[] = ANALYTICS_SLUGS.flatMap((slug) => {
  const employer = EMPLOYERS.find((e) => e.slug === slug)
  return employer ? [employer] : []
})
