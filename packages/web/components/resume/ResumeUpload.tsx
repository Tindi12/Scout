'use client'

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Upload,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'

import { uploadResume } from '@/app/actions/resume'
import { Button } from '@/components/ui/button'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface ResumeUploadProps {
  userId: string
  supabaseUserId: string
  onSuccess?: () => void
}

const ROLE_LABELS: Record<string, string> = {
  swe: 'Software Engineering Intern',
  ml: 'Machine Learning Intern',
  environmental_eng: 'Environmental Engineering Intern',
  aerospace_eng: 'Aerospace Engineering Intern',
  nuclear_eng: 'Nuclear Engineering Intern',
  research: 'Research Intern',
  chem_eng: 'Chemical Engineering Intern',
  mech_eng: 'Mechanical Engineering Intern',
  elec_eng: 'Electrical Engineering Intern',
  civil_eng: 'Civil Engineering Intern',
  bio_eng: 'Biomedical Engineering Intern',
  industrial_eng: 'Industrial Engineering Intern',
}

const DEFAULT_TARGET_ROLE = 'Software Engineering Intern'

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'
const LAST_ANALYSIS_TS_KEY = 'scout:last_analysis_ts'

type UploadPhase =
  | 'uploading_file'
  | 'reading_resume'
  | 'parsing'
  | 'scoring'
  | 'critiquing'
  | 'wrapping_up'

type UploadState =
  | { status: 'idle' }
  | { status: 'selected'; file: File }
  | {
      status: 'uploading'
      file: File
      progress: number
      phase: UploadPhase
    }
  | { status: 'success'; file: File }
  | { status: 'error'; message: string }

const SCOUT_STATUS_BY_PHASE: Record<UploadPhase, readonly string[]> = {
  uploading_file: [
    'scout is receiving your file',
    'scout is securing your upload',
    'scout is unpacking your resume',
  ],
  reading_resume: [
    'scout is reading your resume',
    'scout is scanning every section',
    'scout is extracting the text',
  ],
  parsing: [
    'scout is parsing your experience',
    'scout is mapping education and skills',
    'scout is structuring your bullets',
    'scout is organizing projects',
  ],
  scoring: [
    'scout is analyzing your resume',
    'scout is scoring internship readiness',
    'scout is checking ATS structure',
    'scout is matching keywords to your role',
  ],
  critiquing: [
    'scout is critiquing weak bullets',
    'scout is hunting for missing metrics',
    'scout is flagging improvement areas',
    'scout is comparing you to strong applicants',
  ],
  wrapping_up: [
    'scout is wrapping up your analysis',
    'scout is preparing your score',
    'scout is almost done',
  ],
}

const SCOUT_STATUS_GENERAL: readonly string[] = [
  'scout is getting your resume',
  'scout is analyzing',
  'scout is reading',
  'scout is critiquing',
  'scout is thinking like a recruiter',
  'scout is stress-testing your bullets',
  'scout is looking for hidden strengths',
  'scout is building your breakdown',
]

function pickScoutStatus(
  phase: UploadPhase,
  recent: string[],
): string {
  const pool = [...SCOUT_STATUS_BY_PHASE[phase], ...SCOUT_STATUS_GENERAL]
  const candidates = pool.filter((line) => !recent.includes(line))
  const choices = candidates.length > 0 ? candidates : pool
  return choices[Math.floor(Math.random() * choices.length)] ?? pool[0]!
}

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT_EXT = ['.pdf', '.docx'] as const
const ACCEPT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const
const ACCEPT_ATTR = [...ACCEPT_EXT, ...ACCEPT_MIME].join(',')

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPT_EXT.some((ext) => lower.endsWith(ext))
}

function validateFile(file: File): string | null {
  if (!hasAcceptedExtension(file.name)) {
    return 'Please upload a PDF or DOCX file'
  }
  if (file.type && !ACCEPT_MIME.includes(file.type as (typeof ACCEPT_MIME)[number])) {
    return 'Please upload a PDF or DOCX file'
  }
  if (file.size > MAX_BYTES) {
    return 'File must be under 10MB'
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ResumeUpload({
  userId,
  supabaseUserId,
  onSuccess,
}: ResumeUploadProps) {
  const router = useRouter()

  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const analyzeCreepRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAnalyzeCreep = useCallback(() => {
    if (analyzeCreepRef.current) {
      clearInterval(analyzeCreepRef.current)
      analyzeCreepRef.current = null
    }
  }, [])

  const startAnalyzeCreep = useCallback(() => {
    clearAnalyzeCreep()
    analyzeCreepRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.status !== 'uploading') return prev
        if (prev.progress >= 92) return prev

        const next = Math.min(
          92,
          prev.progress + 0.35 + Math.random() * 0.65,
        )
        let phase: UploadPhase = prev.phase
        if (next >= 78) phase = 'critiquing'
        else if (next >= 58) phase = 'scoring'
        else if (next >= 42) phase = 'parsing'

        return { ...prev, progress: next, phase }
      })
    }, 220)
  }, [clearAnalyzeCreep])

  const patchUpload = useCallback(
    (file: File, progress: number, phase: UploadPhase) => {
      setState({ status: 'uploading', file, progress, phase })
    },
    [],
  )

  useEffect(() => {
    return () => {
      clearAnalyzeCreep()
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
        successTimeoutRef.current = null
      }
    }
  }, [clearAnalyzeCreep])

  const acceptFile = useCallback((file: File) => {
    const error = validateFile(file)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    setState({ status: 'selected', file })
  }, [])

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) acceptFile(file)
    // Reset so picking the same filename twice still fires onChange.
    e.target.value = ''
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) acceptFile(file)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!isDragging) setIsDragging(true)
  }

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleRemove = () => {
    setState({ status: 'idle' })
    setValidationError(null)
  }

  const handleAnalyze = async () => {
    if (state.status !== 'selected') return
    const file = state.file

    patchUpload(file, 6, 'uploading_file')

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('userId', userId)
      fd.append('supabaseUserId', supabaseUserId)

      const result = await uploadResume(fd)

      if (!result.success || !result.resumeId) {
        clearAnalyzeCreep()
        setState({
          status: 'error',
          message: result.error ?? 'Upload failed',
        })
        return
      }

      track(ANALYTICS_EVENTS.RESUME_UPLOADED, {
        file_type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
      })

      patchUpload(file, 30, 'reading_resume')

      const { data: userRow, error: rolesError } = await supabase
        .from('users')
        .select('target_roles')
        .eq('clerk_id', userId)
        .maybeSingle()

      if (rolesError) {
        console.warn('Could not load target_roles:', rolesError.message)
      }

      const roleKey: string | undefined = userRow?.target_roles?.[0]
      const targetRoleLabel =
        (roleKey && ROLE_LABELS[roleKey]) ?? DEFAULT_TARGET_ROLE

      patchUpload(file, 38, 'parsing')
      startAnalyzeCreep()

      const analyzeRes = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resume_id: result.resumeId,
          target_role: targetRoleLabel,
        }),
      })

      clearAnalyzeCreep()

      const analyzeText = await analyzeRes.text()
      if (!analyzeRes.ok) {
        let message = 'Could not analyze resume. Please try again.'
        try {
          const parsed = JSON.parse(analyzeText) as { detail?: unknown }
          if (typeof parsed.detail === 'string') message = parsed.detail
        } catch {
          /* ignore */
        }
        setState({ status: 'error', message })
        return
      }

      const analyzeBody = JSON.parse(analyzeText) as {
        analysis_id?: string
      }
      const analysisId = analyzeBody.analysis_id
      if (!analysisId) {
        setState({
          status: 'error',
          message: 'Analyze returned an unexpected response.',
        })
        return
      }

      track(ANALYTICS_EVENTS.RESUME_SCORED, { target_role: targetRoleLabel })

      patchUpload(file, 100, 'wrapping_up')
      setState({ status: 'success', file })

      try {
        window.localStorage.setItem(LAST_ANALYSIS_ID_KEY, analysisId)
        window.localStorage.setItem(LAST_ANALYSIS_TS_KEY, String(Date.now()))
      } catch {
        /* ignore storage errors (private mode, quota) */
      }

      successTimeoutRef.current = setTimeout(() => {
        router.push(`/resume/analysis?id=${analysisId}`)
        onSuccess?.()
      }, 800)
    } catch (err) {
      clearAnalyzeCreep()
      setState({
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      })
    }
  }

  return (
    <section className="glass-card rounded-2xl p-6 md:p-8">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={onInputChange}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {state.status === 'idle' ? (
        <IdleView
          isDragging={isDragging}
          validationError={validationError}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onChoose={() => inputRef.current?.click()}
        />
      ) : null}

      {state.status === 'selected' ? (
        <SelectedView
          file={state.file}
          onRemove={handleRemove}
          onAnalyze={handleAnalyze}
        />
      ) : null}

      {state.status === 'uploading' ? (
        <UploadingView
          file={state.file}
          progress={state.progress}
          phase={state.phase}
        />
      ) : null}

      {state.status === 'success' ? <SuccessView /> : null}

      {state.status === 'error' ? (
        <ErrorView
          message={state.message}
          onRetry={() => {
            setState({ status: 'idle' })
            setValidationError(null)
          }}
        />
      ) : null}
    </section>
  )
}

function IdleView({
  isDragging,
  validationError,
  onDragOver,
  onDragLeave,
  onDrop,
  onChoose,
}: {
  isDragging: boolean
  validationError: string | null
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onChoose: () => void
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onChoose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChoose()
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 md:py-14',
        isDragging
          ? 'border-[#FF6733]/60 bg-[#FF6733]/[0.04]'
          : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]',
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF6733]/10">
        <FileText className="h-7 w-7 text-[#FF6733]" strokeWidth={1.5} />
      </div>

      <div>
        <h2 className="font-headline text-2xl font-medium tracking-[-0.02em] text-white">
          Upload your resume
        </h2>
        <p className="mt-2 font-body text-sm text-[#999]">
          PDF or DOCX · Max 10MB · Scout will analyze it instantly
        </p>
      </div>

      <Button
        type="button"
        className="mt-1"
        onClick={(e) => {
          e.stopPropagation()
          onChoose()
        }}
      >
        <Upload className="h-4 w-4" strokeWidth={2} />
        Choose file
      </Button>

      <p className="font-body text-xs text-[#555]">
        or drag and drop a PDF or DOCX
      </p>

      {validationError ? (
        <p
          role="alert"
          className="mt-1 inline-flex items-center gap-1.5 font-body text-xs text-[#ef4444]"
        >
          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
          {validationError}
        </p>
      ) : null}
    </div>
  )
}

function SelectedView({
  file,
  onRemove,
  onAnalyze,
}: {
  file: File
  onRemove: () => void
  onAnalyze: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF6733]/10">
          <FileText className="h-5 w-5 text-[#FF6733]" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-sm font-medium text-white">
            {file.name}
          </p>
          <p className="mt-0.5 font-body text-xs text-[#666]">
            {formatBytes(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove file"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#888] transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
        <Button type="button" onClick={onAnalyze}>
          Analyze with Scout
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}

function UploadingView({
  file,
  progress,
  phase,
}: {
  file: File
  progress: number
  phase: UploadPhase
}) {
  const [statusLine, setStatusLine] = useState(() =>
    pickScoutStatus(phase, []),
  )
  const recentLinesRef = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const rotate = () => {
      if (cancelled) return
      const recent = recentLinesRef.current
      const next = pickScoutStatus(phase, recent)
      recentLinesRef.current = [...recent.slice(-4), next]
      setStatusLine(next)
      timeoutId = setTimeout(
        rotate,
        2100 + Math.floor(Math.random() * 900),
      )
    }

    rotate()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [phase])

  const clamped = Math.max(4, Math.min(100, progress))
  const phaseLabel =
    phase === 'uploading_file'
      ? 'Uploading'
      : phase === 'reading_resume'
        ? 'Reading'
        : phase === 'parsing'
          ? 'Parsing'
          : phase === 'scoring'
            ? 'Scoring'
            : phase === 'critiquing'
              ? 'Critiquing'
              : 'Finishing'

  return (
    <div className="relative flex min-h-[88px] flex-col gap-4 py-2 pb-8">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-body text-sm text-[#999]">
          {phaseLabel}…{' '}
          <span className="text-white">{file.name}</span>
        </p>
        <span className="shrink-0 font-label text-xs font-medium tabular-nums text-[#888]">
          {Math.round(clamped)}%
        </span>
      </div>

      <div className="relative h-2 w-full overflow-visible rounded-full bg-white/[0.04]">
        <div
          className="animate-scout-bar-shimmer absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/90 to-primary transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 transition-[left] duration-300 ease-out"
          style={{ left: `${clamped}%` }}
          aria-hidden
        >
          <div className="animate-scout-comet-strike relative -translate-x-full">
            <span className="block h-[2px] w-10 bg-gradient-to-r from-transparent via-white/30 to-white/90" />
            <span className="animate-scout-comet-pulse absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        </div>
      </div>

      <p
        className="absolute bottom-0 right-0 max-w-[min(100%,18rem)] text-right font-body text-xs font-medium leading-snug text-white transition-opacity duration-300"
        aria-live="polite"
      >
        {statusLine}
      </p>
    </div>
  )
}

function SuccessView() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 py-6 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#22c55e]/15 ring-1 ring-[#22c55e]/30">
        <CheckCircle2
          className="h-7 w-7 animate-in zoom-in-50 text-[#22c55e] duration-300"
          strokeWidth={1.75}
        />
      </div>
      <div>
        <p className="font-headline text-lg font-medium text-white">
          Resume uploaded
        </p>
        <p className="mt-1 font-body text-sm text-[#999]">
          Scout is analyzing…
        </p>
      </div>
    </div>
  )
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 py-4 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ef4444]/15 ring-1 ring-[#ef4444]/30">
        <AlertCircle className="h-6 w-6 text-[#ef4444]" strokeWidth={1.75} />
      </div>
      <div>
        <p className="font-headline text-lg font-medium text-white">
          Upload failed
        </p>
        <p className="mt-1 font-body text-sm text-[#999]">{message}</p>
      </div>
      <Button type="button" variant="outline" className="mt-1" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
