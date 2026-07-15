type Listener = (active: boolean) => void

let guideActive = false
const listeners = new Set<Listener>()

/** True while a tour/page-intro/nudge speech is on screen (hides the Copilot launcher). */
export function setMascotGuideActive(active: boolean) {
  if (guideActive === active) return
  guideActive = active
  for (const listener of listeners) listener(guideActive)
}

export function isMascotGuideActive() {
  return guideActive
}

export function subscribeMascotGuide(listener: Listener) {
  listeners.add(listener)
  listener(guideActive)
  return () => {
    listeners.delete(listener)
  }
}
