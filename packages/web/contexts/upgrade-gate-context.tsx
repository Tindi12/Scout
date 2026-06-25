'use client'

import Image from 'next/image'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { SecuredByStripe } from '@/components/billing/SecuredByStripe'
import { UpgradeButton } from '@/components/billing/UpgradeButton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CheckoutTier } from '@/lib/billing'
import { scoutLogo } from '@/lib/scout-logo'
import { planDisplayLabel } from '@/lib/subscription-plan'
import { parseUpgradeRequired } from '@/lib/upgrade-required'

export type ShowUpgradeArgs = {
  requiredTier?: CheckoutTier
  title?: string
  message?: string
}

type UpgradeGateContextValue = {
  /** Open the shared upgrade dialog pointed at the given tier. */
  showUpgrade: (args?: ShowUpgradeArgs) => void
  /**
   * Inspect an API response; if it is a 403 upgrade_required, open the dialog and
   * return true (so the caller can stop). Returns false otherwise.
   */
  handleUpgradeResponse: (status: number, body: unknown) => boolean
}

const UpgradeGateContext = createContext<UpgradeGateContextValue | null>(null)

type DialogState = {
  open: boolean
  tier: CheckoutTier
  title: string
  message: string
}

const DEFAULT_STATE: DialogState = {
  open: false,
  tier: 'pro',
  title: 'Upgrade to unlock this',
  message: 'This feature is part of a paid plan. Upgrade to unlock it.',
}

/**
 * 10.6 — centralizes the "you need to upgrade" UX. Any feature gate (locked UI)
 * or 403 upgrade_required response from any endpoint opens ONE shared dialog,
 * which routes through the single UpgradeButton checkout path.
 */
export function UpgradeGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(DEFAULT_STATE)

  const showUpgrade = useCallback((args?: ShowUpgradeArgs) => {
    const tier: CheckoutTier = args?.requiredTier ?? 'pro'
    setState({
      open: true,
      tier,
      title: args?.title ?? `Upgrade to ${planDisplayLabel(tier)}`,
      message:
        args?.message ??
        'This feature is part of a paid plan. Upgrade to unlock it.',
    })
  }, [])

  const handleUpgradeResponse = useCallback(
    (status: number, body: unknown): boolean => {
      const parsed = parseUpgradeRequired(status, body)
      if (!parsed) return false
      showUpgrade({ requiredTier: parsed.requiredTier, message: parsed.message })
      return true
    },
    [showUpgrade],
  )

  const setOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, open }))
  }, [])

  const value = useMemo(
    () => ({ showUpgrade, handleUpgradeResponse }),
    [showUpgrade, handleUpgradeResponse],
  )

  return (
    <UpgradeGateContext.Provider value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={setOpen}>
        <DialogContent className="glass-card-strong max-w-md gap-5 rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-7 text-white">
          <DialogHeader className="items-center text-center sm:text-center">
            <Image
              src={scoutLogo}
              alt="Scout"
              width={40}
              height={40}
              className="mb-2 h-10 w-10 select-none object-contain"
            />
            <DialogTitle className="font-headline text-2xl font-medium tracking-[-0.02em] text-white">
              {state.title}
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-[#999]">
              {state.message}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            <UpgradeButton tier={state.tier} variant="primary" fullWidth />
            <SecuredByStripe />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-label text-sm font-medium text-[#999] transition-colors hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </UpgradeGateContext.Provider>
  )
}

export function useUpgradeGate() {
  const ctx = useContext(UpgradeGateContext)
  if (!ctx) {
    throw new Error('useUpgradeGate must be used within UpgradeGateProvider')
  }
  return ctx
}

/** Safe variant for components that may render outside the provider. */
export function useUpgradeGateOptional() {
  return useContext(UpgradeGateContext)
}
