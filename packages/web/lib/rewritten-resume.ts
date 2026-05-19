import type { RewrittenResume } from '@/components/resume/RewriteResults'

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

export function normalizeRewrittenResume(raw: unknown): RewrittenResume | null {
  const obj = parseMaybeJson<Record<string, unknown> | null>(raw, null)
  if (!obj || typeof obj !== 'object') return null
  if (!('experience' in obj) && !('projects' in obj) && !('education' in obj)) {
    return null
  }
  return obj as unknown as RewrittenResume
}
