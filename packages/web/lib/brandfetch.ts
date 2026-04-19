import { unstable_cache } from 'next/cache'

export type University = {
  domain: string
  name: string
  logoUrl: string | null
}

const UNIVERSITIES: { domain: string; name: string }[] = [
  { domain: 'ua.edu', name: 'University of Alabama' },
  { domain: 'iu.edu', name: 'Indiana University' },
  { domain: 'gatech.edu', name: 'Georgia Tech' },
  { domain: 'stanford.edu', name: 'Stanford' },
  { domain: 'ucla.edu', name: 'UCLA' },
  { domain: 'ufl.edu', name: 'University of Florida' },
  { domain: 'purdue.edu', name: 'Purdue University' },
  { domain: 'mit.edu', name: 'MIT' },
  { domain: 'nd.edu', name: 'Notre Dame' },
  { domain: 'auburn.edu', name: 'Auburn University' },
  { domain: 'berkeley.edu', name: 'UC Berkeley' },
  { domain: 'cmu.edu', name: 'Carnegie Mellon' },
  { domain: 'uwaterloo.ca', name: 'University of Waterloo' },
]

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7

function buildLogoUrl(domain: string, clientId: string): string {
  return `https://cdn.brandfetch.io/${domain}/w/256/h/64/fallback/transparent?c=${clientId}`
}

async function probeLogo(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      next: { revalidate: SEVEN_DAYS_SECONDS },
    })
    return res.ok
  } catch {
    return false
  }
}

export const fetchUniversityLogos = unstable_cache(
  async (): Promise<University[]> => {
    const clientId = process.env.BRANDFETCH_CLIENT_ID

    if (!clientId) {
      return UNIVERSITIES.map((u) => ({ ...u, logoUrl: null }))
    }

    const results = await Promise.all(
      UNIVERSITIES.map(async (u) => {
        const url = buildLogoUrl(u.domain, clientId)
        const ok = await probeLogo(url)
        return { ...u, logoUrl: ok ? url : null }
      }),
    )

    return results
  },
  ['scout-university-logos-v1'],
  { revalidate: SEVEN_DAYS_SECONDS, tags: ['university-logos'] },
)
