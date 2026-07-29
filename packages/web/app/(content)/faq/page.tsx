import type { Metadata } from 'next'

import { ContentHero, ContentSwap } from '@/components/content/content-page-shell'
import { FaqAccordion } from '@/components/landing/faq'
import { SectionFrame } from '@/components/landing/section-frame'
import { FAQS } from '@/lib/faqs'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'FAQ | Scout',
  description:
    'Answers to common questions about Scout: how the AI apply agent works, tailored resumes, portal safety, and what is included on the free plan.',
  alternates: { canonical: absoluteUrl('/faq') },
  openGraph: {
    title: 'Scout FAQ',
    description:
      'How Scout applies for you, tailored resumes, portal safety, and free-plan details.',
    url: absoluteUrl('/faq'),
    type: 'website',
    siteName: 'Scout',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scout FAQ',
    description:
      'How Scout applies for you, tailored resumes, portal safety, and free-plan details.',
  },
}

export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }

  return (
    <ContentSwap className="pb-20 pt-28 lg:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="px-6 lg:px-12">
        <ContentHero
          eyebrow="FAQ"
          title="Answers to the questions we hear most"
          description="How Scout applies, tailored resumes, portal safety, and what is on the free plan. Short and direct."
        />
      </div>

      <SectionFrame className="mt-10 sm:mt-14">
        <div className="relative px-6 py-10 sm:py-14 lg:px-12 lg:py-16">
          <div className="mx-auto max-w-3xl">
            <FaqAccordion />
          </div>
        </div>
      </SectionFrame>
    </ContentSwap>
  )
}
