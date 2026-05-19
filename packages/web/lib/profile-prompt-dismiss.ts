const STORAGE_KEY = 'scout:profile_prompt_dismissed'

function readMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>
    }
  } catch {
    /* ignore */
  }
  return {}
}

function writeMap(map: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    window.dispatchEvent(new Event('scout:profile_prompt_dismissed'))
  } catch {
    /* ignore */
  }
}

export function isProfilePromptDismissed(clerkUserId: string): boolean {
  if (!clerkUserId) return false
  return Boolean(readMap()[clerkUserId])
}

export function dismissProfilePrompt(clerkUserId: string): void {
  if (!clerkUserId) return
  const map = readMap()
  map[clerkUserId] = true
  writeMap(map)
}
