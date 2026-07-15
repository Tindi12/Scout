'use client'

import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type {
  RewrittenProject,
  RewrittenResume,
} from '@/components/resume/RewriteResults'

import { targetKey, useRefactor } from './RefactorContext'
import type { ResumeVersion } from './types'

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
  return trimmed.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-]/g, '')
}

/** One resume bullet; when Scout changed it, it is linked to a change card. */
function Bullet({
  section,
  itemIndex,
  bulletIndex,
  text,
}: {
  section: 'experience' | 'projects'
  itemIndex: number
  bulletIndex: number
  text: string
}) {
  const { changeByTargetKey, selected, selectChange } = useRefactor()
  const change = changeByTargetKey.get(targetKey(section, itemIndex, bulletIndex))
  const isSelected = change ? selected?.id === change.id : false
  const ignoredChange = change?.status === 'ignored'
  const flashColor = ignoredChange
    ? 'rgba(245, 158, 11, 0.30)'
    : 'rgba(34, 197, 94, 0.30)'
  const flashOut = ignoredChange
    ? 'rgba(245, 158, 11, 0)'
    : 'rgba(34, 197, 94, 0)'

  return (
    <li
      data-change-id={change?.id}
      onClick={change ? () => selectChange(change.id, 'preview') : undefined}
      className={
        change
          ? 'cursor-pointer rounded-sm transition-colors hover:bg-[#FF6733]/10'
          : undefined
      }
      title={change ? 'View this change' : undefined}
    >
      <motion.span
        key={isSelected && selected ? `flash-${selected.tick}` : 'idle'}
        initial={isSelected ? { backgroundColor: flashColor } : false}
        animate={{ backgroundColor: flashOut }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        className="-mx-0.5 rounded-sm px-0.5 box-decoration-clone"
      >
        {text}
      </motion.span>
    </li>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 border-b border-gray-300 pb-0.5 text-xs font-bold uppercase tracking-wider text-black">
      {children}
    </h3>
  )
}

function VersionToggle({
  version,
  onChange,
}: {
  version: ResumeVersion
  onChange: (v: ResumeVersion) => void
}) {
  const options: Array<{ key: ResumeVersion; label: string }> = [
    { key: 'original', label: 'Original' },
    { key: 'optimized', label: 'Optimized' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Resume version"
      className="relative flex rounded-lg border border-white/[0.1] bg-white/[0.04] p-0.5 backdrop-blur-md"
    >
      {options.map((opt) => {
        const active = version === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.key)}
            className={`relative rounded-md px-3 py-1 font-body text-xs font-medium transition-colors ${
              active ? 'text-white' : 'text-[#888] hover:text-white'
            }`}
          >
            {active ? (
              <motion.span
                layoutId="version-toggle-thumb"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute inset-0 rounded-md bg-white/[0.1]"
              />
            ) : null}
            <span className="relative">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ResumeDocument({ resume }: { resume: RewrittenResume }) {
  const contactParts = [resume.email, resume.phone, resume.linkedin, resume.github]
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
    <article
      className="rounded-xl bg-white p-6 text-black shadow-[0_18px_50px_rgba(0,0,0,0.45)] md:p-8"
      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      <header className="flex flex-col items-center text-center">
        <h2 className="text-2xl font-bold text-black">{resume.name}</h2>
        {contactParts.length > 0 ? (
          <p className="mt-1 text-xs text-gray-600">{contactParts.join(' | ')}</p>
        ) : null}
      </header>

      {resume.education?.length ? (
        <section>
          <SectionTitle>Education</SectionTitle>
          <div className="flex flex-col gap-3">
            {resume.education.map((ed, idx) => (
              <div key={`ed-${idx}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-black">{ed.school}</span>
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
                  <span className="text-sm font-bold text-black">{exp.company}</span>
                  <span className="shrink-0 text-xs text-gray-700">
                    {joinDates(exp.start_date, exp.end_date)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm italic text-gray-800">{exp.title}</span>
                  <span className="shrink-0 text-xs italic text-gray-700">
                    {exp.location ?? ''}
                  </span>
                </div>
                {exp.bullets?.length ? (
                  <ul className="mt-1 ml-4 list-disc space-y-1 text-xs text-gray-900">
                    {exp.bullets.map((b, i) => (
                      <Bullet
                        key={i}
                        section="experience"
                        itemIndex={idx}
                        bulletIndex={i}
                        text={b}
                      />
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
                      <Bullet
                        key={i}
                        section="projects"
                        itemIndex={idx}
                        bulletIndex={i}
                        text={b}
                      />
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
  )
}

interface RefactorPreviewProps {
  resumeId: string
  analysisId: string
  userName: string
}

/**
 * Right pane of refactoring mode: the improved resume document with each
 * changed bullet linked to its change card, plus version toggle + download.
 */
export function RefactorPreview({
  resumeId,
  analysisId,
  userName,
}: RefactorPreviewProps) {
  const { resume, downloadResume, changes, selected, version, setVersion } =
    useRefactor()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [download, setDownload] = useState<DownloadState>({ status: 'idle' })

  // When a change card is clicked, scroll the exact bullet into view.
  useEffect(() => {
    if (!selected || selected.source !== 'list' || !containerRef.current) return
    const el = containerRef.current.querySelector(
      `[data-change-id="${selected.id}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selected])

  const anyIgnored = changes.some((c) => c.status === 'ignored')

  const handleDownload = async () => {
    if (download.status === 'loading') return
    setDownload({ status: 'loading' })
    try {
      const payload: Record<string, unknown> = {
        resume_id: resumeId,
        analysis_id: analysisId,
      }
      // If the user kept some originals, download exactly what they reviewed.
      if (anyIgnored) payload.rewritten_resume = downloadResume

      const res = await fetch('/api/resume/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        let detail = 'Could not generate PDF. Please try again.'
        try {
          const parsed = JSON.parse(await res.text()) as { detail?: unknown }
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
      setDownload({ status: 'error', message: 'Network error. Please try again.' })
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
            Resume Preview
          </p>
          <span className="hidden font-body text-xs text-[#666] sm:inline">
            Jake Format · ATS Ready
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <VersionToggle version={version} onChange={setVersion} />
          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            loading={download.status === 'loading'}
          >
            {download.status === 'loading' ? (
              'Generating…'
            ) : (
              <>
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download PDF
              </>
            )}
          </Button>
        </div>
      </header>

      {download.status === 'error' ? (
        <p role="alert" className="font-body text-xs text-red-400">
          {download.message}
        </p>
      ) : null}

      <ResumeDocument resume={resume} />
    </div>
  )
}
