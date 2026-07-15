'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ScoutLogo } from './ScoutLogo'

const STEPS = [
  'Reading experience section',
  'Detecting missing metrics',
  'Improving ATS keywords',
  'Rewriting weak bullets',
  'Generating recommendations',
]

const STEP_INTERVAL_MS = 1500

/** Skeleton document the scanner beam sweeps over. */
function DocumentOutline() {
  const lines = [
    { w: '42%', h: 8, mt: 0 },
    { w: '68%', h: 4, mt: 10 },
    { w: '30%', h: 5, mt: 22 },
    { w: '100%', h: 4, mt: 10 },
    { w: '92%', h: 4, mt: 8 },
    { w: '97%', h: 4, mt: 8 },
    { w: '28%', h: 5, mt: 22 },
    { w: '100%', h: 4, mt: 10 },
    { w: '88%', h: 4, mt: 8 },
    { w: '95%', h: 4, mt: 8 },
    { w: '34%', h: 5, mt: 22 },
    { w: '76%', h: 4, mt: 10 },
  ]

  return (
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className="rounded-full bg-white/[0.09]"
          style={{ width: line.w, height: line.h, marginTop: line.mt }}
        />
      ))}

      {/* scanner beam */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 h-16"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(255,103,51,0.10) 55%, rgba(255,103,51,0.35) 98%, transparent)',
        }}
        initial={{ top: '-20%' }}
        animate={{ top: '110%' }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute inset-x-3 h-px bg-[#FF6733]"
        style={{ boxShadow: '0 0 12px rgba(255,103,51,0.6)' }}
        initial={{ top: '-20%' }}
        animate={{ top: '110%' }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

/**
 * Full-panel loading state shown while the rewrite request runs. Steps are
 * timed locally — the page unmounts this component when the response lands.
 */
export function ResumeScanner() {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, STEPS.length - 1))
    }, STEP_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="glass-card mx-auto w-full max-w-3xl rounded-2xl border border-white/[0.06] p-8 md:p-12">
      <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <DocumentOutline />

        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
              <ScoutLogo className="h-5 w-5 text-[#FF6733]" />
            </div>
            <div>
              <p className="font-headline text-lg font-medium tracking-[-0.01em] text-white">
                Scout is reviewing your resume
              </p>
              <p className="font-body text-xs text-[#777]">
                This takes about 10 seconds
              </p>
            </div>
          </div>

          <ol className="flex flex-col gap-3" aria-live="polite">
            {STEPS.map((step, i) => {
              const done = i < activeStep
              const active = i === activeStep
              return (
                <motion.li
                  key={step}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{
                    opacity: done || active ? 1 : 0.35,
                    x: 0,
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  className="flex items-center gap-3"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      done
                        ? 'border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]'
                        : active
                          ? 'border-[#FF6733]/40 bg-[#FF6733]/10 text-[#FF6733]'
                          : 'border-white/[0.08] text-[#555]'
                    }`}
                  >
                    {done ? (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    ) : (
                      <ArrowRight
                        className={`h-3 w-3 ${active ? 'animate-pulse' : ''}`}
                        strokeWidth={2.5}
                      />
                    )}
                  </span>
                  <span
                    className={`font-body text-sm ${
                      done
                        ? 'text-[#9a9a9a]'
                        : active
                          ? 'font-medium text-white'
                          : 'text-[#666]'
                    }`}
                  >
                    {step}
                  </span>
                </motion.li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
