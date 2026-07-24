'use client'

import { useEffect, useState } from 'react'

// `\n` forces "Never Apply Again." onto its own line under "Scout."; the
// visible text renders with `whitespace-pre-line` so the break is honored.
const PHRASES = [
  'Land Your Dream Internship While You Sleep.',
  'Scout.\nNever Apply Again.',
] as const

/** Primary phrase used as the mobile layout sizer (avoids 2-line reserve). */
const MOBILE_PHRASE = PHRASES[0]

const TYPE_DELAY_MIN = 60
const TYPE_DELAY_MAX = 80
const DELETE_DELAY_MIN = 30
const DELETE_DELAY_MAX = 50
const HOLD_AFTER_TYPED = 2000
const HOLD_AFTER_DELETED = 450
const INITIAL_DELAY = 600

const randomDelay = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min

export function TypingHeadline() {
  const [text, setText] = useState<string>(MOBILE_PHRASE)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const isNarrow = window.matchMedia('(max-width: 639px)').matches

    // Phones + reduced motion: static primary phrase (no typewriter, no tall reserve).
    if (reduceMotion || isNarrow) {
      setText(MOBILE_PHRASE)
      setAnimate(false)
      return
    }

    setAnimate(true)
    setText('')

    let phraseIndex = 0
    let charIndex = 0
    let isDeleting = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const phrase = PHRASES[phraseIndex]

      if (!isDeleting) {
        charIndex += 1
        setText(phrase.slice(0, charIndex))

        if (charIndex === phrase.length) {
          isDeleting = true
          timer = setTimeout(tick, HOLD_AFTER_TYPED)
          return
        }
        timer = setTimeout(tick, randomDelay(TYPE_DELAY_MIN, TYPE_DELAY_MAX))
        return
      }

      charIndex -= 1
      setText(phrase.slice(0, charIndex))

      if (charIndex === 0) {
        isDeleting = false
        phraseIndex = (phraseIndex + 1) % PHRASES.length
        timer = setTimeout(tick, HOLD_AFTER_DELETED)
        return
      }
      timer = setTimeout(tick, randomDelay(DELETE_DELAY_MIN, DELETE_DELAY_MAX))
    }

    timer = setTimeout(tick, INITIAL_DELAY)

    return () => clearTimeout(timer)
  }, [])

  return (
    <h1 className="grid w-full max-w-[20ch] font-headline text-[clamp(1.75rem,6.5vw,5.25rem)] font-medium leading-[1.1] tracking-[-0.04em] text-white sm:max-w-none sm:leading-[1.05]">
      {/* Desktop: reserve tallest phrase so typing never shifts layout.
          Mobile: only size to the primary phrase. */}
      {animate
        ? PHRASES.map((phrase) => (
            <span
              key={phrase}
              aria-hidden
              className="invisible col-start-1 row-start-1 whitespace-pre-line"
            >
              {phrase}
            </span>
          ))
        : (
            <span
              aria-hidden
              className="invisible col-start-1 row-start-1 whitespace-pre-line"
            >
              {MOBILE_PHRASE}
            </span>
          )}

      <span className="col-start-1 row-start-1 whitespace-pre-line">
        <span>{text}</span>
        {animate ? (
          <span
            aria-hidden
            className="animate-cursor-blink ml-[0.04em] inline-block w-[0.055em] translate-y-[0.06em] rounded-[1px] bg-primary align-baseline"
            style={{ height: '0.82em' }}
          />
        ) : null}
      </span>

      {/* Stable, accessible label so screen readers and SEO see real copy
          instead of a mid-animation fragment. */}
      <span className="sr-only">{PHRASES.join(' ').replace(/\n/g, ' ')}</span>
    </h1>
  )
}
