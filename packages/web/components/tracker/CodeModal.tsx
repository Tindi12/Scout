'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { useToast } from '@/hooks/use-toast'

import type { ApplicationRecord } from './tracker-utils'

type CodeModalProps = {
  app: ApplicationRecord | null
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Live verification-code relay. The agent is parked mid-run on this application
 * (status 'awaiting_code'), polling for the code the user pastes here — unlike
 * AnswerModal, nothing is re-queued; the code goes straight into the running
 * browser session.
 */
export function CodeModal({ app, onClose, onSuccess }: CodeModalProps) {
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!app) return null

  const cleaned = code.trim().replace(/\s+/g, '')

  const handleSubmit = async () => {
    if (cleaned.length < 3) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleaned }),
      })
      if (!res.ok) {
        toast({
          title:
            res.status === 422
              ? 'No longer waiting for a code'
              : 'Could not send the code',
          description:
            res.status === 422
              ? 'This application stopped waiting — it may have timed out. Check its status.'
              : 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Code sent to Scout',
        description: 'Scout is entering the code and finishing the application.',
      })
      setCode('')
      onClose()
      onSuccess?.()
    } catch {
      toast({
        title: 'Network error',
        description: 'Could not reach the server.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-modal-title"
    >
      <div
        className="glass-card w-full max-w-lg rounded-2xl border border-white/[0.06] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#22d3ee]">
          VERIFICATION CODE NEEDED
        </p>
        <h2
          id="code-modal-title"
          className="mt-2 font-headline text-lg font-medium text-white"
        >
          {app.company || 'Unknown company'}
        </h2>
        <p className="mt-0.5 font-body text-sm text-[#555]">{app.role || 'Role'}</p>

        <div className="mt-5 rounded-xl bg-white/[0.03] p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#22d3ee]">
            CHECK YOUR EMAIL
          </p>
          <p className="mt-2 font-body text-sm leading-relaxed text-white">
            {app.error_message ||
              'The job site emailed you a verification code. Paste it below within the next few minutes so Scout can finish submitting.'}
          </p>
        </div>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit()
          }}
          placeholder="Paste the code, e.g. 1A2B3C4D"
          maxLength={32}
          disabled={submitting}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          className="mt-4 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 font-mono text-base text-white placeholder:text-[#444] focus:border-[#22d3ee]/50 focus:outline-none disabled:opacity-60"
        />

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-full px-5 font-label text-sm font-medium text-[#888] transition-colors hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || cleaned.length < 3}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#22d3ee] px-5 font-label text-sm font-semibold text-black shadow-[0_0_18px_rgba(34,211,238,0.35)] transition-all hover:shadow-[0_0_24px_rgba(34,211,238,0.55)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                Sending…
              </>
            ) : (
              'Send Code'
            )}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="absolute inset-0 -z-10 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
    </div>
  )
}
