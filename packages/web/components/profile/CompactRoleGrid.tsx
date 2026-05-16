'use client'

import {
  Atom,
  BarChart3,
  Brain,
  Building2,
  Check,
  Code2,
  Cog,
  FlaskConical,
  HeartPulse,
  Leaf,
  Microscope,
  Plane,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import type { TargetRole } from '@/app/actions/onboarding'
import { cn } from '@/lib/utils'

const ROLES: ReadonlyArray<{
  id: TargetRole
  title: string
  Icon: LucideIcon
}> = [
  { id: 'swe', title: 'Software Engineering', Icon: Code2 },
  { id: 'ml', title: 'Machine Learning', Icon: Brain },
  { id: 'data_eng', title: 'Environmental Engineering', Icon: Leaf },
  { id: 'devops', title: 'Aerospace Engineering', Icon: Plane },
  { id: 'product', title: 'Nuclear Engineering', Icon: Atom },
  { id: 'research', title: 'Research', Icon: Microscope },
  { id: 'chem_eng', title: 'Chemical Engineering', Icon: FlaskConical },
  { id: 'mech_eng', title: 'Mechanical Engineering', Icon: Cog },
  { id: 'elec_eng', title: 'Electrical Engineering', Icon: Zap },
  { id: 'civil_eng', title: 'Civil Engineering', Icon: Building2 },
  { id: 'bio_eng', title: 'Biomedical Engineering', Icon: HeartPulse },
  { id: 'industrial_eng', title: 'Industrial Engineering', Icon: BarChart3 },
]

interface CompactRoleGridProps {
  selected: TargetRole[]
  onToggle: (role: TargetRole) => void
}

export function CompactRoleGrid({ selected, onToggle }: CompactRoleGridProps) {
  const set = new Set(selected)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ROLES.map((role) => {
        const isSelected = set.has(role.id)
        const Icon = role.Icon
        return (
          <button
            key={role.id}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            onClick={() => onToggle(role.id)}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.99]',
              isSelected
                ? 'border-[#FF6733]/60 bg-[#FF6733]/[0.06] shadow-[0_0_20px_rgba(255,103,51,0.12)]'
                : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
                isSelected
                  ? 'border-[#FF6733]/40 bg-[#FF6733]/15'
                  : 'border-white/10 bg-white/[0.03] group-hover:border-[#FF6733]/30',
              )}
            >
              <Icon className="h-3.5 w-3.5 text-[#FF6733]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
              {role.title}
            </span>
            {isSelected && (
              <Check
                className="h-3.5 w-3.5 shrink-0 text-[#FF6733]"
                strokeWidth={2.5}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
