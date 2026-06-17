'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div
      className={cn(
        'space-y-2 text-sm leading-relaxed text-[#e6e6e6]',
        '[&_p]:my-0 [&_strong]:font-semibold [&_strong]:text-white',
        '[&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-[#FFB28A]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-white/[0.06] [&_pre]:bg-black/40 [&_pre]:p-3',
        '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
        '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#FF6733] underline underline-offset-2 hover:text-[#ff8254]"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
