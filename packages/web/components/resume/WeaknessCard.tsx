'use client'

export type WeaknessSeverity = 'critical' | 'warning' | 'suggestion'

export interface Weakness {
  type: string
  severity: WeaknessSeverity
  message: string
  suggestion: string
}

interface WeaknessCardProps {
  weakness: Weakness
}

interface SeverityStyle {
  accent: string
  glowSoft: string
  glowHover: string
}

const SEV: Record<WeaknessSeverity, SeverityStyle> = {
  critical: {
    accent: '#ef4444',
    glowSoft: 'rgba(239, 68, 68, 0.10)',
    glowHover: 'rgba(239, 68, 68, 0.22)',
  },
  warning: {
    accent: '#f59e0b',
    glowSoft: 'rgba(245, 158, 11, 0.10)',
    glowHover: 'rgba(245, 158, 11, 0.22)',
  },
  suggestion: {
    accent: '#FF6733',
    glowSoft: 'rgba(255, 103, 51, 0.10)',
    glowHover: 'rgba(255, 103, 51, 0.22)',
  },
}

export function WeaknessCard({ weakness }: WeaknessCardProps) {
  const sev = SEV[weakness.severity] ?? SEV.suggestion

  return (
    <article className="glass-card group relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset ring-white/[0.04] transition-all duration-300 hover:bg-white/[0.04] md:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full blur-3xl transition-opacity duration-500"
        style={{ background: sev.glowSoft }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: sev.glowHover }}
      />

      <div className="relative">
        <header className="flex items-center justify-between gap-3">
          <span className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1 font-label text-[11px] font-medium uppercase tracking-wider text-white/85">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: sev.accent,
                boxShadow: `0 0 8px ${sev.accent}`,
              }}
            />
            {weakness.severity}
          </span>
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[#555]">
            {weakness.type}
          </span>
        </header>

        <p className="mt-4 font-body text-[15px] font-medium leading-relaxed text-white">
          {weakness.message}
        </p>

        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#666]">
            How to fix
          </p>
          <div className="glass-pill mt-2 rounded-xl px-4 py-3">
            <p className="font-body text-sm leading-relaxed text-[#cfcfcf]">
              {weakness.suggestion}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
