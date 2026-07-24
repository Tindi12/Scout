'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const DotLottieReact = dynamic(
  () =>
    import('@lottiefiles/dotlottie-react').then(async (m) => {
      // Self-host WASM — prod CSP blocks the default jsdelivr/unpkg fetch.
      m.setWasmUrl('/lottie/dotlottie-player.wasm')
      return m.DotLottieReact
    }),
  { ssr: false },
)

export function LottiePlayer({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  // Avoid mounting until client mount so the dynamic import + setWasmUrl race
  // can't start fetching animations before WASM is configured.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready) {
    return <div className={className} aria-hidden />
  }

  return <DotLottieReact src={src} loop autoplay className={className} />
}
