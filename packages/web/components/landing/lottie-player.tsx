'use client'

import dynamic from 'next/dynamic'

const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  { ssr: false },
)

export function LottiePlayer({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  return <DotLottieReact src={src} loop autoplay className={className} />
}
