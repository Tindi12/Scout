'use client'

import { useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

import { AmbientLayer } from './AmbientLayer'
import { CopyHeader } from './CopyHeader'
import { HoloPanel, type PanelId, type PanelLayout } from './HoloPanel'
import { PaperPlaneNavigator, type Waypoint } from './PaperPlaneNavigator'
import { ScoutWorkstation } from './ScoutWorkstation'
import { CompanyLogosWidget } from './widgets/CompanyLogosWidget'
import { NotificationWidget } from './widgets/NotificationWidget'
import { PipelineWidget } from './widgets/PipelineWidget'
import { ProfileCardWidget } from './widgets/ProfileCardWidget'
import { TimelineWidget } from './widgets/TimelineWidget'

import './analytics-mission-control.css'

const SCENE_WIDTH = 900
const SCENE_HEIGHT = 520
const CENTER_X = SCENE_WIDTH / 2
const CENTER_Y = SCENE_HEIGHT * 0.58

const DESKTOP_PANELS: PanelLayout[] = [
  { id: 'timeline', top: '8%', left: '4%', width: 140, delay: 0 },
  { id: 'pipeline', top: '4%', left: '38%', width: 160, delay: 0.3 },
  { id: 'companies', top: '8%', left: '72%', width: 140, delay: 0.6 },
  { id: 'notification', top: '38%', left: '2%', width: 140, delay: 0.9 },
  { id: 'profile', top: '38%', left: '78%', width: 150, delay: 1.2 },
]

const MOBILE_PANEL_ORDER: PanelId[] = [
  'timeline',
  'pipeline',
  'companies',
  'notification',
  'profile',
]

function panelToWaypoint(layout: PanelLayout): Waypoint {
  const x = (parseFloat(layout.left) / 100) * SCENE_WIDTH + layout.width / 2
  const y = (parseFloat(layout.top) / 100) * SCENE_HEIGHT + 36
  return { x, y, panelId: layout.id }
}

function renderWidget(id: PanelId) {
  switch (id) {
    case 'timeline':
      return <TimelineWidget />
    case 'pipeline':
      return <PipelineWidget />
    case 'companies':
      return <CompanyLogosWidget />
    case 'profile':
      return <ProfileCardWidget />
    case 'notification':
      return <NotificationWidget />
  }
}

export function MissionControlScene() {
  const reduceMotion = useReducedMotion()

  const waypoints = useMemo<Waypoint[]>(() => {
    const home: Waypoint = { x: CENTER_X, y: CENTER_Y - 20, panelId: 'home' }
    const panelPoints = DESKTOP_PANELS.map(panelToWaypoint)
    return [home, ...panelPoints, home]
  }, [])

  return (
    <section
      className="relative -mx-5 min-h-[calc(100dvh-8rem)] overflow-hidden md:-mx-8"
      aria-label="Scout Mission Control — Analytics coming soon"
    >
      <div className="relative px-5 py-8 md:px-8 md:py-10">
        <CopyHeader />

        <div
          className="relative mx-auto mt-10 hidden max-w-[900px] md:block"
          style={{ height: SCENE_HEIGHT }}
        >
          <AmbientLayer
            panels={DESKTOP_PANELS}
            centerX={CENTER_X}
            centerY={CENTER_Y}
            sceneWidth={SCENE_WIDTH}
            sceneHeight={SCENE_HEIGHT}
            reduceMotion={!!reduceMotion}
          />

          {DESKTOP_PANELS.map((panel) => (
            <HoloPanel
              key={panel.id}
              id={panel.id}
              delay={panel.delay}
              reduceMotion={!!reduceMotion}
              className="absolute"
              style={{
                top: panel.top,
                left: panel.left,
                width: panel.width,
                height: 88,
              }}
            >
              {renderWidget(panel.id)}
            </HoloPanel>
          ))}

          <div
            className="absolute left-1/2 z-20 -translate-x-1/2"
            style={{ top: `${(CENTER_Y / SCENE_HEIGHT) * 100 - 12}%` }}
          >
            <ScoutWorkstation reduceMotion={!!reduceMotion} />
          </div>

          <PaperPlaneNavigator
            waypoints={waypoints}
            sceneWidth={SCENE_WIDTH}
            sceneHeight={SCENE_HEIGHT}
            enabled={!reduceMotion}
          />
        </div>

        <div className="mt-8 md:hidden">
          <div className="mb-6 flex justify-center">
            <ScoutWorkstation reduceMotion={!!reduceMotion} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MOBILE_PANEL_ORDER.map((id, i) => (
              <HoloPanel
                key={id}
                id={id}
                delay={i * 0.2}
                reduceMotion={!!reduceMotion}
                className="relative h-[88px]"
              >
                {renderWidget(id)}
              </HoloPanel>
            ))}
          </div>
          {!reduceMotion ? (
            <div className="relative mx-auto mt-6 h-20 w-60" aria-hidden>
              <PaperPlaneNavigator
                waypoints={[
                  { x: 120, y: 40, panelId: 'home' },
                  { x: 40, y: 60, panelId: 'timeline' },
                  { x: 200, y: 60, panelId: 'companies' },
                  { x: 120, y: 40, panelId: 'home' },
                ]}
                sceneWidth={240}
                sceneHeight={80}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
