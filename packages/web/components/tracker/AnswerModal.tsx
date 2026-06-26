'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { ProfileTextarea } from '@/components/profile/inputs'
import { useToast } from '@/hooks/use-toast'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'

import type { ApplicationRecord } from './tracker-utils'

type AnswerModalProps = {
  app: ApplicationRecord | null
  onClose: () => void
  onSuccess?: () => void
}

export function AnswerModal({ app, onClose, onSuccess }: AnswerModalProps) {
  const { toast } = useToast()
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!app) return null

  const handleSubmit = async () => {
    if (!answerText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText.trim() }),
      })
      if (!res.ok) {
        toast({
          title: 'Could not submit answer',
          description: 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      track(ANALYTICS_EVENTS.APPLICATION_MANUALLY_MANAGED, {
        action: 'answer_submitted',
      })
      toast({
        title: 'Answer submitted',
        description: 'Scout will retry this application.',
      })
      setAnswerText('')
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

  const handleSkip = () => {
    if (submitting) return
    setAnswerText('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="answer-modal-title"
    >
      <div
        className="glass-card w-full max-w-lg rounded-2xl border border-white/[0.06] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#444]">
          SCOUT NEEDS YOUR INPUT
        </p>
        <h2
          id="answer-modal-title"
          className="mt-2 font-headline text-lg font-medium text-white"
        >
          {app.company || 'Unknown company'}
        </h2>
        <p className="mt-0.5 font-body text-sm text-[#555]">{app.role || 'Role'}</p>

        {app.error_message ? (
          <div className="mt-5 rounded-xl bg-white/[0.03] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#FF6733]">
              QUESTION
            </p>
            <p className="mt-2 font-body text-sm leading-relaxed text-white">
              {app.error_message}
            </p>
          </div>
        ) : null}

        <div className="relative mt-4">
          <ProfileTextarea
            value={answerText}
            onValueChange={setAnswerText}
            placeholder="Type your answer here..."
            rows={4}
            disabled={submitting}
            className="min-h-[100px] resize-none pr-14"
          />
          <span className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] text-[#444]">
            {answerText.length}
          </span>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-full px-5 font-label text-sm font-medium text-[#888] transition-colors hover:text-white disabled:opacity-60"
          >
            Skip this application
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !answerText.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                Submitting…
              </>
            ) : (
              'Submit & Retry'
            )}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="absolute inset-0 -z-10 cursor-default"
        aria-label="Close"
        onClick={handleSkip}
      />
    </div>
  )
}
