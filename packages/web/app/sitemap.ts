import type { MetadataRoute } from 'next'

import { getPublishedBlogPosts } from '@/lib/content'
import { absoluteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/pricing'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/blog'),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: absoluteUrl('/faq'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/changelog'),
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: absoluteUrl('/privacy'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/terms'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const posts = getPublishedBlogPosts().map((post) => ({
    url: absoluteUrl(post.href),
    lastModified: post.date,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...staticRoutes, ...posts]
}
