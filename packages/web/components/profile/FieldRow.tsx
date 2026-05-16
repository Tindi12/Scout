'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type FieldStatus = 'idle' | 'saving' | 'saved' | 'error'

interface FieldRowProps {
  htmlFor?: string
  label: string
  optional?: boolean
  labelInfo?: ReactNode
  helper?: string
  status?: FieldStatus
  errorMessage?: string
  children: ReactNode
  className?: string
}

export function FieldRow({
  htmlFor,
  label,
  optional,
  labelInfo,
  helper,
  status = 'idle',
  errorMessage,
  children,
  className,
}: FieldRowProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-2 text-sm text-[#888]"
        >
          <span>{label}</span>
          {optional && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#444]">
              Optional
            </span>
          )}
          {labelInfo}
        </label>
        <SaveBadge status={status} />
      </div>
      {children}
      {helper && !errorMessage && (
        <p className="text-xs text-[#555]">{helper}</p>
      )}
      {errorMessage && (
        <p className="flex items-center gap-1.5 text-xs text-[#ef4444]">
          <AlertCircle className="h-3 w-3" strokeWidth={2} />
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function SaveBadge({ status }: { status: FieldStatus }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === 'saving' && (
        <motion.span
          key="saving"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[#666]"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving
        </motion.span>
      )}
      {status === 'saved' && (
        <motion.span
          key="saved"
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[#22c55e]"
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
          Saved
        </motion.span>
      )}
      {status === 'error' && (
        <motion.span
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[#ef4444]"
        >
          <AlertCircle className="h-3 w-3" strokeWidth={2} />
          Error
        </motion.span>
      )}
    </AnimatePresence>
  )
}
