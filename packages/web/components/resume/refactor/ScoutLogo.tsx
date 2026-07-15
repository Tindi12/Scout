import type { SVGProps } from 'react'

/**
 * Monochrome Scout mark (helmet + visor + paper plane) that inherits
 * `currentColor`, so state color is set via `className="text-…"`.
 * Simplified from docs/imgs/Scout Logo.png so it stays legible at 16px.
 */
export function ScoutLogo({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      className={className}
      {...props}
    >
      {/* helmet — top cap above the visor slot */}
      <path d="M4.55 6.9 A6.9 6.9 0 0 1 17.45 6.9 L4.55 6.9 Z" />
      {/* helmet — jaw below the visor slot */}
      <path d="M4.55 11.3 A6.9 6.9 0 0 0 17.45 11.3 L4.55 11.3 Z" />
      {/* visor lens, poking past the helmet edge like the mark */}
      <rect x="7.4" y="7.7" width="12.2" height="2.8" rx="1.4" />
      {/* left ear disc */}
      <circle cx="3.6" cy="9.1" r="1.7" />
      {/* paper plane */}
      <path d="M9.5 21.4 L21.6 13.9 L17.2 21.9 L15.3 19.6 L13.4 21.9 Z" />
    </svg>
  )
}
