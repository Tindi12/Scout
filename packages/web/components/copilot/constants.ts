export const EXAMPLE_PROMPTS: string[] = [
  "How's my pipeline looking?",
  'Why is my resume scoring low?',
  'What should I apply to next?',
  'Explain my last Scout run',
]

/** Compact relative time like "just now", "5m", "3h", "2d", else a short date. */
export function relativeTime(input: string | null | undefined): string {
  if (!input) return ''
  const then = new Date(input).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
