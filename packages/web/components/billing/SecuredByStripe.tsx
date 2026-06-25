import { Lock } from 'lucide-react'

/**
 * Subtle "Secured by Stripe" trust indicator shown near payment CTAs (issue #214).
 * Dark-theme matched, intentionally understated.
 */
export function SecuredByStripe({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-body text-[11.5px] text-[#71717A] ${className}`}
    >
      <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
      Secured by{' '}
      <span className="font-medium text-[#A1A1AA]">Stripe</span>
    </span>
  )
}
