/**
 * Soft-launch gate: landing CTAs show "Join waitlist now" + waitlist dialog instead of
 * Clerk sign-up. Flip off in Vercel when public access opens.
 *
 * Set NEXT_PUBLIC_WAITLIST_MODE=true (string) to enable.
 */
export function isWaitlistMode(): boolean {
  return process.env.NEXT_PUBLIC_WAITLIST_MODE?.trim() === 'true'
}
