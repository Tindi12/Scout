'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'

type Status = 'idle' | 'loading' | 'success' | 'already' | 'error'

export function NewsletterForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const email = (new FormData(form).get('email') as string | null)?.trim()
    if (!email) return

    setStatus('loading')
    setMessage(null)

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => null)) as {
        status?: string
        detail?: string
      } | null

      if (!res.ok) {
        setStatus('error')
        setMessage(data?.detail || 'Something went wrong. Please try again.')
        return
      }

      if (data?.status === 'already_subscribed') {
        setStatus('already')
        setMessage("You're already on the list.")
      } else {
        setStatus('success')
        setMessage("You're in. Check your inbox for a confirmation.")
        form.reset()
      }
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  const isBusy = status === 'loading'
  const isDone = status === 'success' || status === 'already'

  return (
    <div className="relative w-full">
      <form className="relative flex w-full items-center" onSubmit={handleSubmit}>
        <input
          type="email"
          name="email"
          required
          placeholder="you@university.edu"
          aria-label="Email address"
          disabled={isBusy || isDone}
          className="font-body w-full rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 pr-32 text-[14.5px] text-white placeholder:text-[#888888] transition-colors duration-150 focus:border-white/25 focus:outline-none disabled:opacity-60"
        />
        <Button
          type="submit"
          size="sm"
          disabled={isDone}
          loading={isBusy}
          className="absolute right-1.5"
        >
          {isBusy ? 'Subscribing…' : isDone ? 'Subscribed' : 'Subscribe'}
        </Button>
      </form>
      {message ? (
        <p
          role="status"
          className={`mt-3 font-body text-[13px] ${
            status === 'error' ? 'text-[#f87171]' : 'text-[#A1A1AA]'
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
