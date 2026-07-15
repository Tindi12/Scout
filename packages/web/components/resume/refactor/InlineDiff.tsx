import { diffWords } from './diff'

/**
 * GitHub-style inline word diff: removed words struck through in red,
 * added words highlighted in green, unchanged words muted.
 */
export function InlineDiff({
  before,
  after,
}: {
  before: string
  after: string
}) {
  const segments = diffWords(before, after)

  return (
    <p className="font-body text-sm leading-relaxed">
      {segments.map((seg, i) => {
        const space = i > 0 ? ' ' : ''
        if (seg.kind === 'removed') {
          return (
            <span key={i}>
              {space}
              <del className="rounded-sm bg-red-500/10 px-0.5 text-red-400 line-through decoration-red-400/60">
                {seg.text}
              </del>
            </span>
          )
        }
        if (seg.kind === 'added') {
          return (
            <span key={i}>
              {space}
              <ins className="rounded-sm bg-green-500/10 px-0.5 font-semibold text-green-400 no-underline">
                {seg.text}
              </ins>
            </span>
          )
        }
        return (
          <span key={i} className="text-[#b5b5b5]">
            {space}
            {seg.text}
          </span>
        )
      })}
    </p>
  )
}
