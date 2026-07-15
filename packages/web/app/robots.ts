import type { MetadataRoute } from 'next'

import { absoluteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/', '/changelog', '/pricing', '/privacy', '/terms'],
        disallow: [
          '/dashboard',
          '/explore',
          '/resume',
          '/tracker',
          '/copilot',
          '/profile',
          '/settings',
          '/roles',
          '/analytics',
          '/onboarding',
          '/welcome',
          '/api/',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
