import { unstable_cache } from 'next/cache'

export type University = {
  slug: string | null
  name: string
  logoUrl: string | null
}

/** NCAA school slugs — see https://ncaa-api.henrygd.me/schools-index */
const UNIVERSITIES: { slug: string | null; name: string }[] = [
  { slug: 'alabama', name: 'University of Alabama' },
  { slug: 'indiana', name: 'Indiana University' },
  { slug: 'georgia-tech', name: 'Georgia Tech' },
  { slug: 'stanford', name: 'Stanford' },
  { slug: 'ucla', name: 'UCLA' },
  { slug: 'florida', name: 'University of Florida' },
  { slug: 'purdue', name: 'Purdue University' },
  { slug: 'notre-dame', name: 'Notre Dame' },
  { slug: 'auburn', name: 'Auburn University' },
  { slug: 'california', name: 'UC Berkeley' },
  { slug: 'michigan', name: 'University of Michigan' },
]

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7
const DEFAULT_NCAA_API_URL = 'https://ncaa-api.henrygd.me'

function getApiBaseUrl(): string {
  const raw = process.env.NCAA_API_URL?.trim()
  return (raw || DEFAULT_NCAA_API_URL).replace(/\/$/, '')
}

function buildLogoUrl(slug: string, baseUrl: string): string {
  return `${baseUrl}/logo/${encodeURIComponent(slug)}.svg?dark=true`
}

export const fetchUniversityLogos = unstable_cache(
  async (): Promise<University[]> => {
    const baseUrl = getApiBaseUrl()

    return UNIVERSITIES.map((u) => ({
      slug: u.slug,
      name: u.name,
      logoUrl: u.slug ? buildLogoUrl(u.slug, baseUrl) : null,
    }))
  },
  ['scout-university-logos-ncaa-v2'],
  { revalidate: SEVEN_DAYS_SECONDS, tags: ['university-logos'] },
)
