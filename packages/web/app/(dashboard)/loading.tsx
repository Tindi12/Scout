import { BrandedLoader } from '@/components/branded-loader'

// Fills the RSC render gap when a signed-in user is routed into the app (e.g.
// the redirect back from sign-in / the sso-callback → /dashboard hop) so the
// force-dynamic dashboard shell paints branded instead of blank white.
export default function DashboardLoading() {
  return <BrandedLoader label="Loading your dashboard" />
}
