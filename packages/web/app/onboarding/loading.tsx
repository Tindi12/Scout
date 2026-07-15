import { BrandedLoader } from '@/components/branded-loader'

// Covers the redirect-into-onboarding gap (sign-up → /onboarding, and the
// middleware redirect from /dashboard when onboarding isn't complete).
export default function OnboardingLoading() {
  return <BrandedLoader label="Setting things up" />
}
