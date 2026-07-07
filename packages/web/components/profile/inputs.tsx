'use client'

import { Lock } from 'lucide-react'
import {
  forwardRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/lib/utils'

const BASE_INPUT =
  'font-body w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-[#555] backdrop-blur-md transition-all duration-200 focus:border-primary/60 focus:bg-white/[0.05] focus:outline-none'

type ProfileInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> & {
  value: string
  onValueChange: (value: string) => void
}

export const ProfileInput = forwardRef<HTMLInputElement, ProfileInputProps>(
  function ProfileInput(
    { value, onValueChange, className, ...rest },
    ref,
  ) {
    return (
      <input
        ref={ref}
        {...rest}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onValueChange(event.target.value)
        }
        className={cn(BASE_INPUT, className)}
      />
    )
  },
)

interface ProfileLockedInputProps {
  id?: string
  value: string
  tooltip?: string
}

export function ProfileLockedInput({
  id,
  value,
  tooltip,
}: ProfileLockedInputProps) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        readOnly
        className={cn(BASE_INPUT, 'cursor-not-allowed bg-white/[0.02] pr-10 text-[#999]')}
      />
      <span
        title={tooltip}
        aria-label={tooltip}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#555]"
      >
        <Lock className="h-4 w-4" strokeWidth={1.75} />
      </span>
    </div>
  )
}

type ProfileTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  value: string
  onValueChange: (value: string) => void
}

export const ProfileTextarea = forwardRef<HTMLTextAreaElement, ProfileTextareaProps>(
  function ProfileTextarea(
    { value, onValueChange, className, ...rest },
    ref,
  ) {
    return (
      <textarea
        ref={ref}
        {...rest}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(BASE_INPUT, 'min-h-[120px] resize-y leading-relaxed', className)}
      />
    )
  },
)

type ProfileSelectProps = Omit<
  InputHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange' | 'children'
> & {
  value: string
  onValueChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
  placeholder?: string
}

export function ProfileSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ...rest
}: ProfileSelectProps) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(BASE_INPUT, 'appearance-none pr-10', className)}
    >
      {placeholder !== undefined && (
        <option value="" className="bg-[#0a0a0a]">
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#0a0a0a]">
          {option.label}
        </option>
      ))}
    </select>
  )
}
