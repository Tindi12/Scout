'use client'

import { useEffect, useState } from 'react'

// Soft break after "Internship" avoids the "Sleep." orphan on narrow widths.
const PHRASES = [
  'Land Your Dream Internship\nWhile You Sleep.',
  'Scout.\nNever Apply Again.',
] as const

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
  const [text, setText] = useState('')
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (reduceMotion) {
      setText(PHRASES[1])
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
    <h1 className="grid w-full max-w-[15ch] text-balance font-headline text-[1.625rem] font-medium leading-[1.15] tracking-[-0.04em] text-white sm:max-w-[18ch] sm:text-[clamp(1.75rem,5vw,3.5rem)] sm:leading-[1.1] md:max-w-[22ch] md:text-[clamp(2.25rem,5.5vw,5.25rem)] md:leading-[1.05]">
      {/* Reserve tallest phrase so typing never shifts layout. */}
      {PHRASES.map((phrase) => (
        <span
          key={phrase}
          aria-hidden
          className="invisible col-start-1 row-start-1 whitespace-pre-line text-balance"
        >
          {phrase}
        </span>
      ))}

      <span className="col-start-1 row-start-1 whitespace-pre-line text-balance">
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
