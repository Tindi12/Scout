'use client'

import { cn } from '@/lib/utils'

interface PillOption<T extends string> {
  value: T
  label: string
}

interface PillGroupProps<T extends string> {
  ariaLabel: string
  options: ReadonlyArray<PillOption<T>>
  value: T | null
  onChange: (value: T) => void
}

export function PillGroup<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: PillGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'font-label rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 active:scale-95',
              selected
                ? 'bg-[#FF6733] text-white shadow-[0_0_20px_rgba(255,103,51,0.35)]'
                : 'border border-white/10 bg-white/[0.03] text-[#A1A1AA] hover:border-white/20 hover:bg-white/[0.06] hover:text-white',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
