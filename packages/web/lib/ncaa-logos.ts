export type University = {
  slug: string | null
  name: string
  logoUrl: string | null
}

/**
 * University logos are VENDORED into /public/universities so the landing belt
 * renders 100% of the time — no third-party host in the request path. The SVGs
 * are the dark variants downloaded from the NCAA API (ncaa-api.henrygd.me /
 * github.com/henrygd/ncaa-api, slugs per its /schools-index). To add a school:
 * curl "https://ncaa-api.henrygd.me/logo/<slug>.svg?dark=true" into
 * packages/web/public/universities/<slug>.svg and list it here.
 */
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

export function getUniversityLogos(): University[] {
  return UNIVERSITIES.map((u) => ({
    slug: u.slug,
    name: u.name,
    logoUrl: u.slug ? `/universities/${u.slug}.svg` : null,
  }))
}
