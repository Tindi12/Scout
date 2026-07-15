import { BrandedLoader } from '@/components/branded-loader'

// Shown while the /sign-in and /sign-up routes' RSC payloads load, so the jump
// onto the auth pages is branded rather than a flash of white.
export default function AuthLoading() {
  return <BrandedLoader label="One moment" />
}
