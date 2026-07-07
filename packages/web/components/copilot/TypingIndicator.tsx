'use client'

export function TypingIndicator() {
  return (
    <span
      aria-label="Scout is thinking"
      className="inline-flex items-center gap-1 py-1"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}
