import { formatContentDate } from '@/lib/content'

type ArticleMetaProps = {
  category: string
  date: string
  readTime: string
  author: string
}

export function ArticleMeta({ category, date, readTime, author }: ArticleMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-label inline-flex items-center rounded-md border border-primary/70 bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground">
        {category}
      </span>
      <span className="font-body text-sm text-[#888888]">{formatContentDate(date)}</span>
      <span className="font-body text-sm text-[#888888]">{readTime}</span>
      <span className="font-body text-sm text-[#A1A1AA]">
        By <span className="text-white">{author}</span>
      </span>
    </div>
  )
}
