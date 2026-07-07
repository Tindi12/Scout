'use client'

import { Button } from '@/components/ui/button'

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
          <Button
            key={option.value}
            type="button"
            variant="chip"
            size="sm"
            role="radio"
            aria-checked={selected}
            data-state={selected ? 'selected' : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
