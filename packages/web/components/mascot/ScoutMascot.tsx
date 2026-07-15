'use client'

import Image from 'next/image'
import Link from 'next/link'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { MASCOT_ASSETS, type MascotPose } from '@/lib/mascot'
import { cn } from '@/lib/utils'

export type ScoutMascotAction = {
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'ghost'
}

type ScoutMascotProps = {
  pose: MascotPose
  message?: ReactNode
  title?: string
  actions?: ScoutMascotAction[]
  onDismiss?: () => void
  dismissLabel?: string
  /** Where the cluster sits on screen. */
  placement?: 'bottom-left' | 'bottom-right' | 'peek-right'
  className?: string
  /** When true, decorative wrapper ignores pointer events except interactive kids. */
  peripheral?: boolean
  imageSize?: number
  speechMaxWidth?: string
}

const PLACEMENT: Record<
  NonNullable<ScoutMascotProps['placement']>,
  string
> = {
  'bottom-left':
    'fixed bottom-24 left-5 z-[35] flex flex-col items-start md:bottom-6 md:left-6',
  'bottom-right':
    'fixed bottom-24 right-5 z-[45] flex flex-col items-end md:bottom-6 md:right-6',
  'peek-right':
    'fixed bottom-28 right-0 z-[45] flex flex-col items-end md:bottom-8',
}

export function ScoutMascot({
  pose,
  message,
  title,
  actions,
  onDismiss,
  dismissLabel = 'Dismiss',
  placement = 'bottom-left',
  className,
  peripheral = false,
  imageSize,
  speechMaxWidth = 'max-w-[16rem]',
}: ScoutMascotProps) {
  const reduceMotion = useReducedMotion()
  const size =
    imageSize ??
    (pose === 'idle' ? 72 : pose === 'peek' ? 110 : 96)

  const enter =
    pose === 'peek'
      ? { opacity: 0, x: 48 }
      : { opacity: 0, y: 12, scale: 0.96 }
  const shown = { opacity: 1, x: 0, y: 0, scale: 1 }

  return (
    <div
      className={cn(
        PLACEMENT[placement],
        peripheral && 'pointer-events-none',
        className,
      )}
      data-scout-mascot={pose}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={pose}
          initial={reduceMotion ? false : enter}
          animate={shown}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
          className={cn(
            'relative flex flex-col',
            placement === 'peek-right' || placement === 'bottom-right'
              ? 'items-end'
              : 'items-start',
          )}
        >
          {(title || message || actions || onDismiss) ? (
            <div
              className={cn(
                'glass-card-strong pointer-events-auto mb-2 rounded-2xl border border-white/[0.1] bg-[#0a0a0a]/95 p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]',
                speechMaxWidth,
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {title ? (
                    <p className="font-headline text-sm font-semibold leading-snug text-white">
                      {title}
                    </p>
                  ) : null}
                  {message ? (
                    <div className="font-body text-xs leading-relaxed text-[#999]">
                      {message}
                    </div>
                  ) : null}
                </div>
                {onDismiss ? (
                  <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#666] transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                ) : null}
              </div>

              {actions && actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {actions.map((action) => {
                    const variant =
                      action.variant === 'ghost' ? 'ghost' : 'default'
                    if (action.href) {
                      return (
                        <Button
                          key={action.label}
                          asChild
                          size="sm"
                          variant={variant}
                          className="h-8 px-3 text-xs"
                        >
                          <Link href={action.href} onClick={action.onClick}>
                            {action.label}
                          </Link>
                        </Button>
                      )
                    }
                    return (
                      <Button
                        key={action.label}
                        type="button"
                        size="sm"
                        variant={variant}
                        className="h-8 px-3 text-xs"
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className={cn(
              'relative select-none',
              peripheral ? 'pointer-events-none' : 'pointer-events-auto',
              pose === 'peek' && 'translate-x-4 md:translate-x-5',
            )}
            aria-hidden={pose === 'idle'}
          >
            <Image
              src={MASCOT_ASSETS[pose]}
              alt=""
              width={size}
              height={size}
              priority={pose !== 'idle'}
              draggable={false}
              className={cn(
                'object-contain',
                pose === 'peek' && 'origin-bottom-right',
              )}
              style={{ width: size, height: size }}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
