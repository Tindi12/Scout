'use client'

import { ArrowUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Ask Scout anything…',
  autoFocus = false,
}: {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow the textarea with content, up to a cap.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2 transition-colors focus-within:border-[#FF6733]/40">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        className="max-h-[140px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-white placeholder:text-[#555] focus:outline-none"
      />
      <Button
        type="button"
        size="icon"
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="h-9 w-9 shrink-0 rounded-xl"
      >
        <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
      </Button>
    </div>
  )
}
