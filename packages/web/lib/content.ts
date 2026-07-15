import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type ContentKind = 'blog' | 'changelog'

export type BlogPostMeta = {
  kind: 'blog'
  title: string
  slug: string
  description: string
  author: string
  date: string
  category: string
  coverImage: string
  coverTone?: string
  readTime: string
  comingSoon?: boolean
  draft?: boolean
  seoTitle?: string
  seoDescription?: string
  keywords?: string[]
}

export type ChangelogMeta = {
  kind: 'changelog'
  title: string
  slug: string
  description: string
  version: string
  date: string
  coverImage?: string
  draft?: boolean
  seoTitle?: string
  seoDescription?: string
}

export type ContentMeta = BlogPostMeta | ChangelogMeta

export type ContentEntry<T extends ContentMeta = ContentMeta> = T & {
  content: string
  href: string
}

const CONTENT_ROOT = join(process.cwd(), 'content')

function contentDir(kind: ContentKind): string {
  return join(CONTENT_ROOT, kind)
}

function parseScalar(raw: string): string | boolean | string[] {
  const value = raw.trim()
  if (value === 'true') return true
  if (value === 'false') return false
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => {
      const token = item.trim()
      if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        return token.slice(1, -1)
      }
      return token
    })
  }
  return value
}

function parseFrontmatter(source: string): {
  data: Record<string, unknown>
  body: string
} {
  const trimmed = source.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---')) {
    return { data: {}, body: trimmed }
  }
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) {
    return { data: {}, body: trimmed }
  }
  const matter = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, '')
  const data: Record<string, unknown> = {}
  for (const line of matter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) continue
    data[match[1]] = parseScalar(match[2])
  }
  return { data, body }
}

function requireString(data: Record<string, unknown>, key: string, file: string): string {
  const value = data[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required frontmatter "${key}" in ${file}`)
  }
  return value.trim()
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalBool(data: Record<string, unknown>, key: string): boolean | undefined {
  const value = data[key]
  return typeof value === 'boolean' ? value : undefined
}

function optionalStringArray(data: Record<string, unknown>, key: string): string[] | undefined {
  const value = data[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function listMarkdownFiles(kind: ContentKind): string[] {
  try {
    return readdirSync(contentDir(kind))
      .filter((name) => name.endsWith('.md'))
      .sort()
  } catch {
    return []
  }
}

function loadRaw(kind: ContentKind, slug: string): ContentEntry | null {
  const file = `${slug}.md`
  const path = join(contentDir(kind), file)
  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    return null
  }

  const { data, body } = parseFrontmatter(source)
  const title = requireString(data, 'title', file)
  const description = requireString(data, 'description', file)
  const date = requireString(data, 'date', file)
  const frontSlug = optionalString(data, 'slug') || slug

  if (kind === 'blog') {
    const entry: ContentEntry<BlogPostMeta> = {
      kind: 'blog',
      title,
      slug: frontSlug,
      description,
      author: requireString(data, 'author', file),
      date,
      category: requireString(data, 'category', file),
      coverImage: optionalString(data, 'coverImage') || `/blog/covers/${frontSlug}.jpg`,
      coverTone: optionalString(data, 'coverTone'),
      readTime: optionalString(data, 'readTime') || '5 min read',
      comingSoon: optionalBool(data, 'comingSoon') ?? false,
      draft: optionalBool(data, 'draft') ?? false,
      seoTitle: optionalString(data, 'seoTitle'),
      seoDescription: optionalString(data, 'seoDescription'),
      keywords: optionalStringArray(data, 'keywords'),
      content: body.trim(),
      href: `/blog/${frontSlug}`,
    }
    return entry
  }

  const entry: ContentEntry<ChangelogMeta> = {
    kind: 'changelog',
    title,
    slug: frontSlug,
    description,
    version: requireString(data, 'version', file),
    date,
    coverImage: optionalString(data, 'coverImage'),
    draft: optionalBool(data, 'draft') ?? false,
    seoTitle: optionalString(data, 'seoTitle'),
    seoDescription: optionalString(data, 'seoDescription'),
    content: body.trim(),
    href: `/changelog#${frontSlug}`,
  }
  return entry
}

function byDateDesc(a: { date: string }, b: { date: string }) {
  return b.date.localeCompare(a.date)
}

/** All blog posts including coming-soon (excludes drafts). */
export function getAllBlogPosts(): ContentEntry<BlogPostMeta>[] {
  return listMarkdownFiles('blog')
    .map((file) => loadRaw('blog', file.replace(/\.md$/, '')) as ContentEntry<BlogPostMeta> | null)
    .filter((post): post is ContentEntry<BlogPostMeta> => Boolean(post) && !post!.draft)
    .sort(byDateDesc)
}

/** Published blog posts suitable for the public index + sitemap. */
export function getPublishedBlogPosts(): ContentEntry<BlogPostMeta>[] {
  return getAllBlogPosts().filter((post) => !post.comingSoon)
}

export function getBlogPost(slug: string): ContentEntry<BlogPostMeta> | null {
  const post = loadRaw('blog', slug)
  if (!post || post.kind !== 'blog' || post.draft) return null
  return post
}

export function getAllChangelogEntries(): ContentEntry<ChangelogMeta>[] {
  return listMarkdownFiles('changelog')
    .map(
      (file) =>
        loadRaw('changelog', file.replace(/\.md$/, '')) as ContentEntry<ChangelogMeta> | null,
    )
    .filter((entry): entry is ContentEntry<ChangelogMeta> => Boolean(entry) && !entry!.draft)
    .sort(byDateDesc)
}

export function getChangelogEntry(slug: string): ContentEntry<ChangelogMeta> | null {
  const entry = loadRaw('changelog', slug)
  if (!entry || entry.kind !== 'changelog' || entry.draft) return null
  return entry
}

export function formatContentDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
