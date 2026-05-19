'use client'

import type { RewrittenResume } from '@/components/resume/RewriteResults'

function joinDates(start?: string, end?: string): string {
  const s = (start ?? '').trim()
  const e = (end ?? '').trim()
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

function projectDate(p: {
  date?: string
  start_date?: string
  end_date?: string
}): string {
  if (p.date?.trim()) return p.date.trim()
  return joinDates(p.start_date, p.end_date)
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 border-b border-gray-300 pb-0.5 text-xs font-bold uppercase tracking-wider text-black">
      {children}
    </h3>
  )
}

type JakeResumePreviewProps = {
  resume: RewrittenResume
  compact?: boolean
  className?: string
}

export function JakeResumePreview({
  resume,
  compact = false,
  className,
}: JakeResumePreviewProps) {
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
    <article
      className={
        className ??
        `rounded-xl bg-white text-black shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${
          compact ? 'p-4 text-[11px]' : 'p-6 md:p-8'
        }`
      }
      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      <header className="flex flex-col items-center text-center">
        <h2 className={compact ? 'text-lg font-bold' : 'text-2xl font-bold'}>
          {resume.name}
        </h2>
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
                  <span className="text-sm font-bold">{ed.school}</span>
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
                  <span className="text-sm font-bold">{exp.company}</span>
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
  )
}
