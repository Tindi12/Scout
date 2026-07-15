import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

/**
 * Shared chrome for every Scout transactional email: banner up top, founder
 * signature + footer at the bottom. Light theme on purpose, it survives
 * Gmail/Outlook/Apple Mail dark-mode transforms far better than replicating the
 * app's #080808 aesthetic. Essential content is always real text; the banner is
 * decoration only (alt="Scout" carries the brand when images are blocked).
 *
 * banner.jpg is a compressed 1040x344 JPEG (~25KB); the original banner.png
 * (3584x1184, 2.5MB) made the banner visibly lag in on open. Keep new banner
 * uploads under ~50KB.
 */

export const ACCENT = '#FF6733'
export const BANNER_URL =
  'https://vyrtlehuexjllrdnehmc.supabase.co/storage/v1/object/public/brand/banner.jpg'

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const bodyText = {
  fontFamily: FONT_STACK,
  fontSize: '15px',
  lineHeight: '24px',
  color: '#3f3f46',
  margin: '0 0 16px',
} as const

/** Mirrors the app's button system (packages/web/components/ui/button.tsx —
 * rounded-md, bg-primary with a border-primary/70 edge, compact semibold label).
 * Keep in sync when the app button changes. */
export const ctaButton = {
  fontFamily: FONT_STACK,
  fontSize: '14px',
  fontWeight: 600 as const,
  color: '#ffffff',
  backgroundColor: ACCENT,
  border: '1px solid rgba(255, 103, 51, 0.7)',
  borderRadius: '6px',
  padding: '9px 18px',
  textDecoration: 'none',
  display: 'inline-block',
}

export function Signature() {
  return (
    <Section style={{ marginTop: '28px' }}>
      <Text style={{ ...bodyText, margin: '0' }}>Tindi</Text>
      <Text style={{ ...bodyText, margin: '0', color: '#71717a', fontSize: '13px' }}>
        Founder and CEO of Scout
      </Text>
    </Section>
  )
}

export function ScoutLayout({
  preview,
  footer,
  children,
}: {
  preview: string
  /** Overrides the second footer line (default: the account-holder disclosure).
   * Newsletter mail needs its own line plus an unsubscribe link here instead. */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', margin: 0, padding: '24px 12px' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '520px',
            margin: '0 auto',
            overflow: 'hidden',
          }}
        >
          <Img
            src={BANNER_URL}
            alt="Scout"
            width="520"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          <Section style={{ padding: '28px 32px 32px' }}>{children}</Section>
        </Container>
        <Container style={{ maxWidth: '520px', margin: '0 auto' }}>
          <Hr style={{ borderColor: '#e4e4e7', margin: '20px 0 12px' }} />
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: '12px',
              lineHeight: '18px',
              color: '#a1a1aa',
              textAlign: 'center' as const,
              margin: 0,
            }}
          >
            Scout: Never Apply Again.
            <br />
            {footer ?? "You're receiving this because you have a Scout account."}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
