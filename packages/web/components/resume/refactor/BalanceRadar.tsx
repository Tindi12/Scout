'use client'

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import type { ScoreBreakdown } from './types'

const BRAND = '#FF6733'
const MAX_PER_DIMENSION = 25

interface BalanceRadarProps {
  breakdown: ScoreBreakdown
  height?: number
}

type RadarDatum = {
  category: string
  value: number
  raw: number
}

function clamp25(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(MAX_PER_DIMENSION, value))
}

function toData(breakdown: ScoreBreakdown): RadarDatum[] {
  const rows: Array<[string, number]> = [
    ['Structure', breakdown.structure],
    ['Metrics', breakdown.metrics],
    ['Keywords', breakdown.keywords],
    ['Experience', breakdown.experience],
  ]
  return rows.map(([category, raw]) => {
    const clamped = clamp25(raw)
    return {
      category,
      value: (clamped / MAX_PER_DIMENSION) * 100,
      raw: Math.round(clamped),
    }
  })
}

function RadarTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: RadarDatum }>
}) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0c0c0c]/95 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md">
      <p className="font-label text-[10px] uppercase tracking-[0.18em] text-[#888]">
        {datum.category}
      </p>
      <p className="mt-0.5 font-body text-sm font-medium tabular-nums text-white">
        {datum.raw}
        <span className="text-[#666]"> / {MAX_PER_DIMENSION}</span>
      </p>
    </div>
  )
}

/**
 * Shows the *shape* of the resume — whether structure, metrics, keywords and
 * experience are in balance — rather than just the total score.
 */
export function BalanceRadar({ breakdown, height = 240 }: BalanceRadarProps) {
  const data = toData(breakdown)

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: '#8a8a8a', fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip
            content={<RadarTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
          />
          <Radar
            dataKey="value"
            stroke={BRAND}
            strokeWidth={2}
            fill={BRAND}
            fillOpacity={0.12}
            dot={{ r: 3, fill: BRAND, strokeWidth: 0 }}
            activeDot={{ r: 4.5, fill: BRAND, stroke: '#050505', strokeWidth: 2 }}
            isAnimationActive
            animationDuration={900}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* screen-reader table view of the same data */}
      <table className="sr-only">
        <caption>Resume balance by category</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.category}>
              <th scope="row">{d.category}</th>
              <td>
                {d.raw} of {MAX_PER_DIMENSION}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
