'use client'

import { motion } from 'framer-motion'
import {
  ChevronDown,
  Compass,
  Download,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export type BeforeAfterDiff = {
  section: 'experience' | 'projects'
  company?: string
  name?: string
  original: string
  rewritten: string
}

export type RewrittenEducation = {
  school: string
  degree: string
  field: string
  location?: string
  end_date?: string
  start_date?: string
  gpa?: number | null
}

export type RewrittenExperience = {
  company: string
  title: string
  location?: string
  start_date?: string
  end_date?: string
  bullets: string[]
}

export type RewrittenProject = {
  name: string
  tech_stack: string[]
  date?: string
  start_date?: string
  end_date?: string
  bullets: string[]
}

export type RewrittenSkills = {
  technical?: string[]
  certifications?: string[]
  organizations?: string[]
  languages?: string[]
  frameworks?: string[]
  tools?: string[]
  platforms?: string[]
}

export type RewrittenResume = {
  name: string
  email: string
  phone: string
  linkedin?: string
  github?: string
  education: RewrittenEducation[]
  experience: RewrittenExperience[]
  projects: RewrittenProject[]
  skills: RewrittenSkills
}

interface RewriteResultsProps {
  beforeAfter: BeforeAfterDiff[]
  rewrittenResume: RewrittenResume
  analysisId: string
  resumeId: string
  userName: string
}

type DownloadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }

function joinDates(start?: string, end?: string): string {
  const s = (start ?? '').trim()
  const e = (end ?? '').trim()
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

function projectDate(p: RewrittenProject): string {
  if (p.date && p.date.trim()) return p.date.trim()
  return joinDates(p.start_date, p.end_date)
}

function safeFileName(name: string): string {
  const trimmed = name.trim() || 'Scout_User'
  const collapsed = trimmed.replace(/\s+/g, '_')
  return collapsed.replace(/[^A-Za-z0-9_\-]/g, '')
}

function groupDiffs(beforeAfter: BeforeAfterDiff[]): Array<{
  label: string
  items: BeforeAfterDiff[]
}> {
  const groups = new Map<string, BeforeAfterDiff[]>()
  for (const diff of beforeAfter) {
    const label = (diff.company || diff.name || 'Other').trim() || 'Other'
    const list = groups.get(label) ?? []
    list.push(diff)
    groups.set(label, list)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

export function RewriteResults({
  beforeAfter,
  rewrittenResume,
  analysisId,
  resumeId,
  userName,
}: RewriteResultsProps) {
  const [download, setDownload] = useState<DownloadState>({ status: 'idle' })

  const grouped = useMemo(() => groupDiffs(beforeAfter), [beforeAfter])

  const handleDownload = async () => {
    if (download.status === 'loading') return
    setDownload({ status: 'loading' })
    try {
      const res = await fetch('/api/resume/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: resumeId,
          analysis_id: analysisId,
        }),
      })

      if (!res.ok) {
        let detail = 'Could not generate PDF. Please try again.'
        try {
          const text = await res.text()
          const parsed = JSON.parse(text) as { detail?: unknown }
          if (typeof parsed?.detail === 'string') detail = parsed.detail
        } catch {
          /* keep default */
        }
        setDownload({ status: 'error', message: detail })
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeFileName(userName)}_Resume.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setDownload({ status: 'idle' })
    } catch {
      setDownload({
        status: 'error',
        message: 'Network error. Please try again.',
      })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ChangesCard grouped={grouped} count={beforeAfter.length} />
      <PreviewCard resume={rewrittenResume} />
      <ActionsCard download={download} onDownload={handleDownload} />
    </div>
  )
}

function ChangesCard({
  grouped,
  count,
}: {
  grouped: Array<{ label: string; items: BeforeAfterDiff[] }>
  count: number
}) {
  return (
    <section className="glass-card relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 md:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FF6733]/[0.04] blur-3xl"
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4 text-[#FF6733]"
              strokeWidth={2}
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#FF6733]">
              What Scout Changed
            </p>
          </div>
          <p className="font-body text-xs text-[#666]">
            {count} {count === 1 ? 'bullet improved' : 'bullets improved'}
          </p>
        </div>

        {count === 0 ? (
          <p className="mt-8 text-center font-body text-sm text-[#888]">
            Scout kept your bullets — they were already strong.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            {grouped.map((group, gIdx) => (
              <div key={`${group.label}-${gIdx}`} className="flex flex-col">
                <p className="mb-2 font-mono text-xs uppercase text-[#555]">
                  {group.label}
                </p>
                <div className="flex flex-col">
                  {group.items.map((diff, idx) => {
                    const globalIndex =
                      grouped
                        .slice(0, gIdx)
                        .reduce((acc, g) => acc + g.items.length, 0) + idx
                    return (
                      <motion.div
                        key={`${group.label}-${idx}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.35,
                          ease: 'easeOut',
                          delay: globalIndex * 0.08,
                        }}
                        className={
                          idx === 0
                            ? 'flex flex-col gap-2 pb-4'
                            : 'flex flex-col gap-2 border-t border-white/[0.04] py-4 last:pb-0'
                        }
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-[#ef4444]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#ef4444]">
                            Before
                          </span>
                          <p className="font-body text-sm leading-relaxed text-[#888] line-through decoration-[#888]/50">
                            {diff.original}
                          </p>
                        </div>

                        <div className="flex justify-start pl-1">
                          <ChevronDown
                            className="h-3.5 w-3.5 text-[#444]"
                            strokeWidth={2}
                          />
                        </div>

                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-[#22c55e]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#22c55e]">
                            After
                          </span>
                          <p className="font-body text-sm font-medium leading-relaxed text-white">
                            {diff.rewritten}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PreviewCard({ resume }: { resume: RewrittenResume }) {
  const contactParts = [
    resume.email,
    resume.phone,
    resume.linkedin,
    resume.github,
  ]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)

  const skills = resume.skills ?? {}
  const technical = (skills.technical?.length
    ? skills.technical
    : [
        ...(skills.languages ?? []),
        ...(skills.frameworks ?? []),
        ...(skills.tools ?? []),
        ...(skills.platforms ?? []),
      ]
  ).filter(Boolean)
  const certifications = (skills.certifications ?? []).filter(Boolean)
  const organizations = (skills.organizations ?? []).filter(Boolean)

  return (
    <section className="glass-card relative overflow-hidden rounded-2xl border border-white/[0.06] p-5 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#FF6733]" strokeWidth={2} />
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#FF6733]">
            Your Optimized Resume
          </p>
        </div>
        <p className="font-body text-xs text-[#666]">Jake Format · ATS Ready</p>
      </div>

      <article
        className="mt-5 rounded-xl bg-white p-6 text-black shadow-[0_18px_50px_rgba(0,0,0,0.45)] md:p-8"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        <header className="flex flex-col items-center text-center">
          <h2 className="text-2xl font-bold text-black">{resume.name}</h2>
          {contactParts.length > 0 ? (
            <p className="mt-1 text-xs text-gray-600">
              {contactParts.join(' | ')}
            </p>
          ) : null}
        </header>

        {resume.education?.length ? (
          <section>
            <SectionTitle>Education</SectionTitle>
            <div className="flex flex-col gap-3">
              {resume.education.map((ed, idx) => (
                <div key={`ed-${idx}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-black">
                      {ed.school}
                    </span>
                    <span className="shrink-0 text-xs text-gray-700">
                      {(ed.end_date && ed.end_date.trim()) ||
                        joinDates(ed.start_date, ed.end_date)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm italic text-gray-800">
                      {[ed.degree, ed.field].filter(Boolean).join(' in ')}
                    </span>
                    <span className="shrink-0 text-xs italic text-gray-700">
                      {ed.location ?? ''}
                    </span>
                  </div>
                  {typeof ed.gpa === 'number' ? (
                    <p className="text-xs text-gray-600">GPA: {ed.gpa}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.experience?.length ? (
          <section>
            <SectionTitle>Experience</SectionTitle>
            <div className="flex flex-col gap-4">
              {resume.experience.map((exp, idx) => (
                <div key={`exp-${idx}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-black">
                      {exp.company}
                    </span>
                    <span className="shrink-0 text-xs text-gray-700">
                      {joinDates(exp.start_date, exp.end_date)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm italic text-gray-800">
                      {exp.title}
                    </span>
                    <span className="shrink-0 text-xs italic text-gray-700">
                      {exp.location ?? ''}
                    </span>
                  </div>
                  {exp.bullets?.length ? (
                    <ul className="mt-1 ml-4 list-disc space-y-1 text-xs text-gray-900">
                      {exp.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.projects?.length ? (
          <section>
            <SectionTitle>Projects</SectionTitle>
            <div className="flex flex-col gap-4">
              {resume.projects.map((proj, idx) => (
                <div key={`proj-${idx}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-black">
                      <span className="font-bold">{proj.name}</span>
                      {proj.tech_stack?.length ? (
                        <span className="italic text-gray-700">
                          {' '}
                          | {proj.tech_stack.join(', ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-gray-700">
                      {projectDate(proj)}
                    </span>
                  </div>
                  {proj.bullets?.length ? (
                    <ul className="mt-1 ml-4 list-disc space-y-1 text-xs text-gray-900">
                      {proj.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {technical.length || certifications.length || organizations.length ? (
          <section>
            <SectionTitle>Technical Skills &amp; Extracurriculars</SectionTitle>
            <div className="flex flex-col gap-1 text-xs text-gray-900">
              {technical.length ? (
                <p>
                  <span className="font-bold">Technical Skills:</span>{' '}
                  {technical.join(', ')}
                </p>
              ) : null}
              {certifications.length ? (
                <p>
                  <span className="font-bold">Certifications:</span>{' '}
                  {certifications.join(', ')}
                </p>
              ) : null}
              {organizations.length ? (
                <p>
                  <span className="font-bold">Organizations:</span>{' '}
                  {organizations.join(', ')}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </article>
    </section>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 border-b border-gray-300 pb-0.5 text-xs font-bold uppercase tracking-wider text-black">
      {children}
    </h3>
  )
}

function ActionsCard({
  download,
  onDownload,
}: {
  download: DownloadState
  onDownload: () => void
}) {
  const loading = download.status === 'loading'

  return (
    <section className="glass-card flex flex-col gap-3 rounded-2xl border border-white/[0.06] p-5 md:p-6">
      <button
        type="button"
        onClick={onDownload}
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#FF6733] px-6 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Generating PDF...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" strokeWidth={2} />
            Download PDF — scout_resume.pdf
          </>
        )}
      </button>

      {download.status === 'error' ? (
        <p
          role="alert"
          className="text-center font-body text-xs text-[#ef4444]"
        >
          {download.message}
        </p>
      ) : null}

      <Link
        href="/explore"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 font-label text-sm font-semibold text-[#888] transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
      >
        <Compass className="h-4 w-4" strokeWidth={2} />
        Tailor resume for a specific job →
      </Link>
    </section>
  )
}
