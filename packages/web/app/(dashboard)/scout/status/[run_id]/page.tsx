import { redirect } from 'next/navigation'

type PageProps = {
  params: Promise<{ run_id: string }>
}

/** Legacy URL — scout run progress lives on Tracker. */
export default async function ScoutStatusRedirectPage({ params }: PageProps) {
  const { run_id } = await params
  redirect(`/tracker?run_id=${encodeURIComponent(run_id)}`)
}
