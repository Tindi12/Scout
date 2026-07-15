import type {
  BeforeAfterDiff,
  RewrittenResume,
} from '@/components/resume/RewriteResults'

export type SuggestionSeverity = 'critical' | 'warning' | 'suggestion'

export type SuggestionStatus = 'pending' | 'applied' | 'ignored'

/** One issue Scout found during analysis, linked to the resume where possible. */
export type ResumeSuggestion = {
  id: string
  /** Backend weakness code, e.g. MISSING_METRICS */
  type: string
  severity: SuggestionSeverity
  message: string
  suggestion: string
  status: SuggestionStatus
}

export type ChangeStatus = 'applied' | 'ignored'

/** Where a change lands inside the rewritten resume document. */
export type ChangeTarget = {
  section: 'experience' | 'projects'
  itemIndex: number
  bulletIndex: number
}

/** One bullet Scout rewrote — drives the diff sidebar and preview linking. */
export type ResumeChange = {
  id: string
  section: 'experience' | 'projects'
  /** Company or project name the bullet belongs to. */
  group: string
  original: string
  rewritten: string
  status: ChangeStatus
  /** Resolved position in the rewritten resume; undefined if no match found. */
  target?: ChangeTarget
}

export type RefactorMode = 'analysis' | 'scanning' | 'refactor'

export type ResumeVersion = 'original' | 'optimized'

export type ScoreBreakdown = {
  experience: number
  metrics: number
  structure: number
  keywords: number
}

function normalizeBullet(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/g, '').trim()
}

/**
 * Build ResumeChange records from the rewrite API's before/after diffs and
 * resolve each one to a bullet position inside the rewritten resume so the
 * sidebar can scroll/highlight the exact line.
 */
export function buildChanges(
  beforeAfter: BeforeAfterDiff[],
  resume: RewrittenResume,
): ResumeChange[] {
  const claimed = new Set<string>()

  const locate = (diff: BeforeAfterDiff): ChangeTarget | undefined => {
    const wanted = normalizeBullet(diff.rewritten)
    if (!wanted) return undefined
    const groupName = normalizeBullet(diff.company ?? diff.name ?? '')

    const scan = (
      section: 'experience' | 'projects',
      requireGroup: boolean,
    ): ChangeTarget | undefined => {
      const items = section === 'experience' ? resume.experience : resume.projects
      if (!Array.isArray(items)) return undefined
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const itemName = normalizeBullet(
          section === 'experience'
            ? ((item as { company?: string }).company ?? '')
            : ((item as { name?: string }).name ?? ''),
        )
        if (requireGroup && groupName && itemName !== groupName) continue
        const bullets = (item as { bullets?: string[] }).bullets ?? []
        for (let b = 0; b < bullets.length; b++) {
          const key = `${section}:${i}:${b}`
          if (claimed.has(key)) continue
          if (normalizeBullet(bullets[b] ?? '') === wanted) {
            claimed.add(key)
            return { section, itemIndex: i, bulletIndex: b }
          }
        }
      }
      return undefined
    }

    return (
      scan(diff.section, true) ??
      scan(diff.section, false) ??
      scan(diff.section === 'experience' ? 'projects' : 'experience', false)
    )
  }

  return beforeAfter.map((diff, index) => ({
    id: `change-${index}`,
    section: diff.section,
    group: (diff.company ?? diff.name ?? 'Other').trim() || 'Other',
    original: diff.original,
    rewritten: diff.rewritten,
    status: 'applied' as const,
    target: locate(diff),
  }))
}

/**
 * The resume that should actually render / download: the rewritten resume
 * with any ignored changes reverted to their original bullet text.
 */
export function applyChangeStatuses(
  resume: RewrittenResume,
  changes: ResumeChange[],
  version: ResumeVersion,
): RewrittenResume {
  const reverts = changes.filter(
    (c) => c.target && (version === 'original' || c.status === 'ignored'),
  )
  if (reverts.length === 0) return resume

  const next: RewrittenResume = {
    ...resume,
    experience: (resume.experience ?? []).map((e) => ({
      ...e,
      bullets: [...(e.bullets ?? [])],
    })),
    projects: (resume.projects ?? []).map((p) => ({
      ...p,
      bullets: [...(p.bullets ?? [])],
    })),
  }

  for (const change of reverts) {
    const t = change.target
    if (!t) continue
    const items = t.section === 'experience' ? next.experience : next.projects
    const bullets = items[t.itemIndex]?.bullets
    if (bullets && t.bulletIndex < bullets.length) {
      bullets[t.bulletIndex] = change.original
    }
  }

  return next
}
