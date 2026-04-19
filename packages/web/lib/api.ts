const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '')

export type ApiJson = Record<string, unknown> | unknown[]

export class ApiError extends Error {
  readonly status: number
  readonly body: string | null

  constructor(message: string, status: number, body: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function joinUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (!API_BASE) return p
  return `${API_BASE}${p}`
}

function parseJsonBody(text: string): unknown {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError('Response was not valid JSON', 500, text)
  }
}

export async function apiFetch<T extends ApiJson>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(joinUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const text = await res.text()
  const data = parseJsonBody(text)

  if (!res.ok) {
    throw new ApiError(
      `API request failed (${res.status})`,
      res.status,
      text || null,
    )
  }

  return data as T
}
