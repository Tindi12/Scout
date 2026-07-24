'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

const DotLottieReact = dynamic(
  () =>
    import('@lottiefiles/dotlottie-react').then(async (m) => {
      // Self-host WASM — prod CSP blocks the default jsdelivr/unpkg fetch.
      m.setWasmUrl('/lottie/dotlottie-player.wasm')
      return m.DotLottieReact
    }),
  { ssr: false },
)

/**
 * Lazy-mount DotLottie only when visible so the ~1.7MB WASM stays off LCP.
 * Respects prefers-reduced-motion (static slot, no player).
 */
export function LottiePlayer({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (reduceMotion) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '120px 0px', threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduceMotion])

  if (reduceMotion) {
    return <div className={className} aria-hidden />
  }

  return (
    <div ref={ref} className={className}>
      {inView ? (
        <DotLottieReact src={src} loop autoplay className="h-full w-full" />
      ) : (
        <div className="h-full w-full" aria-hidden />
      )}
    </div>
  )
}
