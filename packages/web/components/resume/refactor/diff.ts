export type DiffSegment = {
  kind: 'same' | 'removed' | 'added'
  text: string
}

/**
 * Word-level diff (LCS) between two short strings. Bullets are < 100 words,
 * so the O(n·m) table is fine. Consecutive words of the same kind are merged
 * into a single segment for rendering.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = before.split(/\s+/).filter(Boolean)
  const b = after.split(/\s+/).filter(Boolean)

  const n = a.length
  const m = b.length
  // lcs[i][j] = LCS length of a[i:], b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const raw: DiffSegment[] = []
  const push = (kind: DiffSegment['kind'], word: string) => {
    const last = raw[raw.length - 1]
    if (last && last.kind === kind) {
      last.text += ` ${word}`
    } else {
      raw.push({ kind, text: word })
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('removed', a[i])
      i++
    } else {
      push('added', b[j])
      j++
    }
  }
  while (i < n) push('removed', a[i++])
  while (j < m) push('added', b[j++])

  return raw
}
