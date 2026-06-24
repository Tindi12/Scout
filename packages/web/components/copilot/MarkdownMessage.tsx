'use client'

import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

const LINK_CLASS =
  'font-medium text-[#FF6733] underline underline-offset-2 hover:text-[#ff8254]'

/** Known in-app routes the copilot is allowed to link to. Bare references like
 * "tracker" or "/tracker" resolve here so they navigate in-app instead of being
 * treated as external URLs. */
const INTERNAL_ROUTES = new Set([
  '/dashboard',
  '/explore',
  '/resume',
  '/tracker',
  '/copilot',
  '/profile',
  '/settings',
  '/analytics',
  '/roles',
])

type ResolvedHref =
  | { kind: 'internal'; href: string }
  | { kind: 'external'; href: string }
  | { kind: 'plain' }

function resolveHref(raw?: string): ResolvedHref {
  const href = (raw ?? '').trim()
  if (!href) return { kind: 'plain' }

  // App-relative paths (always navigate in-app, same tab).
  if (href.startsWith('/')) {
    return { kind: 'internal', href }
  }

  // Real external links and contact protocols open in a new tab.
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
    return { kind: 'external', href }
  }

  // Bare words like "tracker" — map to a known route, otherwise don't navigate
  // (prevents the model's hallucinated/relative hrefs from going off to random
  // domains).
  const candidate = `/${href.replace(/^\/+/, '').toLowerCase()}`
  if (INTERNAL_ROUTES.has(candidate)) {
    return { kind: 'internal', href: candidate }
  }
  return { kind: 'plain' }
}

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
          a: ({ href, children }) => {
            const resolved = resolveHref(href)
            if (resolved.kind === 'internal') {
              return (
                <Link href={resolved.href} className={LINK_CLASS}>
                  {children}
                </Link>
              )
            }
            if (resolved.kind === 'external') {
              return (
                <a
                  href={resolved.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASS}
                >
                  {children}
                </a>
              )
            }
            // Unknown / unsafe href — render the label as plain emphasized text.
            return <span className="font-medium text-white">{children}</span>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
