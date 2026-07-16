export type University = {
  slug: string | null
  name: string
  logoUrl: string | null
}

/**
 * University logos are VENDORED into /public/universities so the landing section
 * renders 100% of the time — no third-party host in the request path. The SVGs
 * are the dark variants downloaded from the NCAA API (ncaa-api.henrygd.me /
 * github.com/henrygd/ncaa-api, slugs per its /schools-index). To add a school:
 * curl "https://ncaa-api.henrygd.me/logo/<slug>.svg?dark=true" into
 * packages/web/public/universities/<slug>.svg and list it here.
 *
 * Landing social-proof intentionally keeps a short, balanced set — map over
 * this list to render (do not hardcode individual logo JSX).
 */
const UNIVERSITIES: { slug: string; name: string }[] = [
  { slug: 'alabama', name: 'The University of Alabama' },
  { slug: 'indiana', name: 'Indiana University' },
  { slug: 'michigan', name: 'University of Michigan' },
  { slug: 'purdue', name: 'Purdue University' },
]

/** Build the university logo list used by the landing social-proof section. */
export function getUniversityLogos(): University[] {
  return UNIVERSITIES.map((u) => ({
    slug: u.slug,
    name: u.name,
    logoUrl: `/universities/${u.slug}.svg`,
  }))
}
