import type { Metadata } from 'next'

import { ChangelogCard } from '@/components/content/changelog-card'
import { ContentHero, ContentSwap } from '@/components/content/content-page-shell'
import { ContentTabs } from '@/components/content/content-tabs'
import { MarkdownProse } from '@/components/content/markdown-prose'
import { getAllChangelogEntries } from '@/lib/content'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Changelog | Scout',
  description:
    "Follow Scout's progress as we improve the AI application agent: product launches, reliability work, and weekly upgrades.",
  alternates: { canonical: absoluteUrl('/changelog') },
  openGraph: {
    title: 'Scout Changelog',
    description: "Product updates as Scout's AI application agent improves every week.",
    url: absoluteUrl('/changelog'),
    type: 'website',
    siteName: 'Scout',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scout Changelog',
    description: "Product updates as Scout's AI application agent improves every week.",
  },
}

export default function ChangelogPage() {
  const entries = getAllChangelogEntries()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Scout Changelog',
    description: 'Product updates for the Scout AI application agent.',
    url: absoluteUrl('/changelog'),
  }

  return (
    <ContentSwap className="px-6 pb-20 pt-28 lg:px-12 lg:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContentHero
        eyebrow="Product updates"
        title="Changelog"
        description="Follow Scout's progress as we improve the AI application agent."
      />
      <ContentTabs />

      <div className="mx-auto mt-10 max-w-3xl space-y-6 sm:mt-14 sm:space-y-8">
        {entries.map((entry) => (
          <ChangelogCard key={entry.slug} entry={entry}>
            <MarkdownProse content={entry.content} />
          </ChangelogCard>
        ))}
      </div>
    </ContentSwap>
  )
}
