import Image from 'next/image'
import Link from 'next/link'

import { formatContentDate, type BlogPostMeta, type ContentEntry } from '@/lib/content'
import { cn } from '@/lib/utils'

type BlogCardProps = {
  post: ContentEntry<BlogPostMeta>
  featured?: boolean
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  return (
    <Link
      href={post.href}
      className={cn(
        'group glass-card relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-200',
        'hover:border-white/16 hover:bg-white/[0.035]',
        featured && 'md:flex-row',
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden border-b border-white/5 bg-[#0A0A0A]',
          featured ? 'aspect-[16/10] md:aspect-auto md:w-[44%] md:border-b-0 md:border-r' : 'aspect-[16/10]',
        )}
      >
        <Image
          src={post.coverImage}
          alt=""
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          sizes={featured ? '(min-width: 768px) 40vw, 100vw' : '(min-width: 1024px) 33vw, 100vw'}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"
        />
        {post.comingSoon ? (
          <span className="font-label absolute left-4 top-4 rounded-md border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D4D4D8] backdrop-blur-sm">
            Coming soon
          </span>
        ) : null}
      </div>

      <div className={cn('flex flex-1 flex-col p-4 sm:p-6', featured && 'md:p-8')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF6733]">
            {post.category}
          </span>
          <span className="font-body text-[12px] text-[#71717A]">
            {formatContentDate(post.date)}
          </span>
          <span className="font-body text-[12px] text-[#71717A]">{post.readTime}</span>
        </div>

        <h2
          className={cn(
            'mt-3 font-headline font-medium tracking-[-0.02em] text-white transition-colors group-hover:text-white',
            featured ? 'text-2xl md:text-3xl' : 'text-xl',
          )}
        >
          {post.title}
        </h2>

        <p className="mt-3 flex-1 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
          {post.description}
        </p>

        <span className="font-label mt-5 inline-flex items-center gap-1 text-[12px] font-medium tracking-[0.04em] text-[#FF6733] transition-all duration-200 group-hover:gap-1.5">
          {post.comingSoon ? 'Preview' : 'Read article'}
          <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  )
}
