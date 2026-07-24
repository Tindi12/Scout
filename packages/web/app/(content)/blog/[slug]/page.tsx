import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ArticleMeta } from '@/components/content/article-meta'
import { ContentSwap } from '@/components/content/content-page-shell'
import { MarkdownProse } from '@/components/content/markdown-prose'
import { ComingSoonCta } from '@/components/landing/waitlist'
import { Button } from '@/components/ui/button'
import { getAllBlogPosts, getBlogPost } from '@/lib/content'
import { absoluteUrl } from '@/lib/site'
import { isWaitlistMode } from '@/lib/waitlist-mode'

type PageProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}

  const title = post.seoTitle || `${post.title} | Scout Blog`
  const description = post.seoDescription || post.description
  const url = absoluteUrl(post.href)

  return {
    title,
    description,
    keywords: post.keywords,
    alternates: { canonical: url },
    robots: post.comingSoon ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      siteName: 'Scout',
      publishedTime: post.date,
      authors: [post.author],
      images: [{ url: absoluteUrl(post.coverImage) }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteUrl(post.coverImage)],
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Scout',
      url: absoluteUrl('/'),
    },
    mainEntityOfPage: absoluteUrl(post.href),
    image: absoluteUrl(post.coverImage),
  }

  return (
    <ContentSwap className="px-6 lg:px-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl">
        <Link
          href="/blog"
          className="font-label text-sm font-medium text-[#A1A1AA] transition-colors hover:text-white"
        >
          ← All articles
        </Link>

        <div className="mt-8">
          <ArticleMeta
            category={post.category}
            date={post.date}
            readTime={post.readTime}
            author={post.author}
          />
        </div>

        <h1 className="mt-6 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
          {post.title}
        </h1>
        <p className="mt-5 font-body text-lg leading-relaxed text-[#A1A1AA]">
          {post.description}
        </p>

        <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A]">
          <Image
            src={post.coverImage}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(min-width: 768px) 768px, 100vw"
          />
        </div>

        {post.comingSoon ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-[#FF6733]">
              Coming soon
            </p>
            <p className="mt-2 font-body text-sm text-[#A1A1AA]">
              This article is outlined for SEO and on our roadmap. The full
              piece isn&apos;t published yet. Here&apos;s the current preview.
            </p>
          </div>
        ) : null}

        <div className="mt-12">
          <MarkdownProse content={post.content} />
        </div>

        <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-headline text-xl font-medium text-white">
              {isWaitlistMode()
                ? 'Public access is coming soon'
                : 'Ready to stop filling forms?'}
            </p>
            <p className="mt-1 font-body text-sm text-[#A1A1AA]">
              {isWaitlistMode()
                ? 'Scout is in private beta. Join the waitlist for a seat when we open up.'
                : 'Try Scout, the AI job application agent built for students.'}
            </p>
          </div>
          {isWaitlistMode() ? (
            <ComingSoonCta source="blog" />
          ) : (
            <Button asChild>
              <Link href="/sign-up">Try Scout Now</Link>
            </Button>
          )}
        </div>
      </article>
    </ContentSwap>
  )
}
