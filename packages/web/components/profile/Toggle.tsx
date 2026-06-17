'use client'

import { cn } from '@/lib/utils'

interface ToggleProps {
  id?: string
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}

export function Toggle({ id, label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/10',
        disabled && 'cursor-not-allowed opacity-60 hover:border-white/[0.06]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm text-white">{label}</span>
        {description && (
          <span className="text-xs text-[#666]">{description}</span>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked)
        }}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-[#FF6733]' : 'bg-white/10',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}
