'use client'

import type { PanelLayout } from './HoloPanel'

type AmbientLayerProps = {
  panels: PanelLayout[]
  centerX: number
  centerY: number
  sceneWidth: number
  sceneHeight: number
  reduceMotion?: boolean
}

export function AmbientLayer({
  panels,
  centerX,
  centerY,
  sceneWidth,
  sceneHeight,
  reduceMotion,
}: AmbientLayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#080808_75%)] opacity-60" />

      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <svg
        className="absolute inset-0 hidden h-full w-full lg:block"
        viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
        preserveAspectRatio="none"
        fill="none"
      >
        {panels.map((panel) => {
          const px = (parseFloat(panel.left) / 100) * sceneWidth + panel.width / 2
          const py = (parseFloat(panel.top) / 100) * sceneHeight + 40
          return (
            <line
              key={panel.id}
              x1={centerX}
              y1={centerY}
              x2={px}
              y2={py}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              strokeDasharray="4 6"
              className={reduceMotion ? '' : 'analytics-connector'}
            />
          )
        })}
      </svg>
    </div>
  )
}
