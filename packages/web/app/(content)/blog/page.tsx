import type { Metadata } from 'next'

import { BlogCard } from '@/components/content/blog-card'
import { ContentHero, ContentSwap } from '@/components/content/content-page-shell'
import { ContentTabs } from '@/components/content/content-tabs'
import { getAllBlogPosts } from '@/lib/content'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Blog | Scout - AI Career Insights for Students',
  description:
    'Founder stories, product updates, and guides on AI job application agents, internship application automation, and career tools for engineering students.',
  alternates: { canonical: absoluteUrl('/blog') },
  openGraph: {
    title: 'Scout Blog',
    description:
      'Insights on AI application agents, internship automation, and building Scout.',
    url: absoluteUrl('/blog'),
    type: 'website',
    siteName: 'Scout',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scout Blog',
    description:
      'Insights on AI application agents, internship automation, and building Scout.',
  },
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts()
  const pinnedSlug = 'why-i-built-scout'
  const pinned = posts.find((post) => post.slug === pinnedSlug) ?? null
  const rest = posts.filter((post) => post.slug !== pinnedSlug)
  const featured = pinned ?? rest[0] ?? null
  const gridPosts = pinned ? rest : rest.slice(1)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Scout Blog',
    description:
      'Articles about Scout, AI job application agents, and internship automation for students.',
    url: absoluteUrl('/blog'),
  }

  return (
    <ContentSwap>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContentHero
        eyebrow="Knowledge center"
        title="Scout Blog"
        description="Founder stories, product deep-dives, and practical guides for students using AI career tools. Written like a serious AI startup, not a content mill."
      />
      <ContentTabs />

      {/* Extra inset past the landing rails so cards sit inside the grid, not flush to it. */}
      <div className="mx-auto mt-10 max-w-6xl space-y-6 px-9 sm:mt-14 sm:space-y-8 sm:px-10 lg:px-16">
        {featured ? <BlogCard post={featured} featured /> : null}
        {gridPosts.length > 0 ? (
          <div className="grid gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {gridPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        ) : null}
      </div>
    </ContentSwap>
  )
}
