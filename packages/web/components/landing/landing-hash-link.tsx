'use client'

import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'

import { handleLandingHashClick } from '@/lib/landing-scroll'

type LandingHashLinkProps = ComponentProps<typeof Link>

/**
 * Same-page landing anchors scroll immediately instead of waiting on
 * App Router hash navigation.
 */
export function LandingHashLink({
  href,
  onClick,
  ...props
}: LandingHashLinkProps) {
  const hrefString = typeof href === 'string' ? href : null

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (!hrefString || event.defaultPrevented) return
    handleLandingHashClick(event, hrefString)
  }

  return <Link href={href} onClick={handleClick} {...props} />
}
