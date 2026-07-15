import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

const LINK_CLASS =
  'font-medium text-[#FF6733] underline-offset-4 transition-colors hover:text-[#ff8254] hover:underline'

type MarkdownProseProps = {
  content: string
  className?: string
}

export function MarkdownProse({ content, className }: MarkdownProseProps) {
  return (
    <div
      className={cn(
        'font-body space-y-5 text-[15.5px] leading-[1.75] text-[#A1A1AA]',
        '[&_h2]:mt-10 [&_h2]:font-headline [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-white',
        '[&_h3]:mt-8 [&_h3]:font-headline [&_h3]:text-xl [&_h3]:font-medium [&_h3]:tracking-tight [&_h3]:text-white',
        '[&_strong]:font-semibold [&_strong]:text-white',
        '[&_em]:italic',
        '[&_a]:text-[#FF6733]',
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-[#FF6733]/80',
        '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5',
        '[&_li]:pl-1',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-[#FF6733]/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#D4D4D8]',
        '[&_hr]:my-10 [&_hr]:border-white/10',
        '[&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-[#FFB28A]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/50 [&_pre]:p-4',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const url = href ?? ''
            const external = /^(https?:\/\/|mailto:)/i.test(url)
            if (url.startsWith('/')) {
              return (
                <Link href={url} className={LINK_CLASS}>
                  {children}
                </Link>
              )
            }
            if (external) {
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASS}
                >
                  {children}
                </a>
              )
            }
            return <span>{children}</span>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
