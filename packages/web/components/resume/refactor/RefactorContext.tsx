'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type {
  BeforeAfterDiff,
  RewrittenResume,
} from '@/components/resume/RewriteResults'

import {
  applyChangeStatuses,
  buildChanges,
  type ChangeStatus,
  type ResumeChange,
  type ResumeVersion,
} from './types'

export type ChangeSelection = {
  id: string
  /** Which pane initiated the selection, so the other pane scrolls. */
  source: 'list' | 'preview'
  /** Monotonic counter so re-selecting the same change re-triggers the flash. */
  tick: number
}

type RefactorContextValue = {
  /** Resume as it should render right now (version toggle + ignored reverts). */
  resume: RewrittenResume
  /** Resume that should be downloaded (ignored reverts only). */
  downloadResume: RewrittenResume
  changes: ResumeChange[]
  appliedCount: number
  selected: ChangeSelection | null
  version: ResumeVersion
  selectChange: (id: string, source: ChangeSelection['source']) => void
  setChangeStatus: (id: string, status: ChangeStatus) => void
  setVersion: (version: ResumeVersion) => void
  /** `${section}:${itemIndex}:${bulletIndex}` → change, for preview linking. */
  changeByTargetKey: Map<string, ResumeChange>
}

const RefactorContext = createContext<RefactorContextValue | null>(null)

export function targetKey(
  section: 'experience' | 'projects',
  itemIndex: number,
  bulletIndex: number,
): string {
  return `${section}:${itemIndex}:${bulletIndex}`
}

export function RefactorProvider({
  rewrittenResume,
  beforeAfter,
  children,
}: {
  rewrittenResume: RewrittenResume
  beforeAfter: BeforeAfterDiff[]
  children: ReactNode
}) {
  const baseChanges = useMemo(
    () => buildChanges(beforeAfter, rewrittenResume),
    [beforeAfter, rewrittenResume],
  )

  const [statuses, setStatuses] = useState<Record<string, ChangeStatus>>({})
  const [selected, setSelected] = useState<ChangeSelection | null>(null)
  const [version, setVersion] = useState<ResumeVersion>('optimized')
  const tickRef = useRef(0)

  const changes = useMemo(
    () =>
      baseChanges.map((c) => ({
        ...c,
        status: statuses[c.id] ?? c.status,
      })),
    [baseChanges, statuses],
  )

  const resume = useMemo(
    () => applyChangeStatuses(rewrittenResume, changes, version),
    [rewrittenResume, changes, version],
  )

  const downloadResume = useMemo(
    () => applyChangeStatuses(rewrittenResume, changes, 'optimized'),
    [rewrittenResume, changes],
  )

  const changeByTargetKey = useMemo(() => {
    const map = new Map<string, ResumeChange>()
    for (const change of changes) {
      if (change.target) {
        map.set(
          targetKey(
            change.target.section,
            change.target.itemIndex,
            change.target.bulletIndex,
          ),
          change,
        )
      }
    }
    return map
  }, [changes])

  const selectChange = useCallback(
    (id: string, source: ChangeSelection['source']) => {
      tickRef.current += 1
      setSelected({ id, source, tick: tickRef.current })
    },
    [],
  )

  const setChangeStatus = useCallback((id: string, status: ChangeStatus) => {
    setStatuses((prev) => ({ ...prev, [id]: status }))
  }, [])

  const appliedCount = changes.filter((c) => c.status === 'applied').length

  const value: RefactorContextValue = {
    resume,
    downloadResume,
    changes,
    appliedCount,
    selected,
    version,
    selectChange,
    setChangeStatus,
    setVersion,
    changeByTargetKey,
  }

  return (
    <RefactorContext.Provider value={value}>
      {children}
    </RefactorContext.Provider>
  )
}

export function useRefactor(): RefactorContextValue {
  const ctx = useContext(RefactorContext)
  if (!ctx) {
    throw new Error('useRefactor must be used inside <RefactorProvider>')
  }
  return ctx
}
