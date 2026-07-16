import { NextResponse } from 'next/server'

import { fetchPlatformStats } from '@/lib/landing-stats'

/**
 * Public landing metrics for client-side live counters.
 * Returns paced targets (seed floors + launch caps) backed by live DB counts.
 */
export async function GET() {
  try {
    const stats = await fetchPlatformStats()
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      },
    })
  } catch {
    return NextResponse.json(
      { detail: 'Failed to load platform stats' },
      { status: 500 },
    )
  }
}
