import { Button, Section, Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText, ctaButton } from './_layout'

/**
 * Upgrade thank-you — fired from the Stripe webhook grant paths, once per tier
 * per user (email_sends claim). Tier copy is baked at build time: the build
 * script renders one artifact per tier (upgrade_pro, upgrade_scout_plus).
 */

const TIER_LINES: Record<'pro' | 'scout_plus', { name: string; unlocked: string }> = {
  pro: {
    name: 'Scout Pro',
    unlocked:
      '40 applications every 30 days, the full Scout Agent applying on your behalf, and unlimited resume rewrites.',
  },
  scout_plus: {
    name: 'Scout+',
    unlocked:
      '100 applications every 30 days and priority on everything: runs, rewrites, support.',
  },
}

export default function UpgradeEmail({ tier = 'pro' }: { tier?: 'pro' | 'scout_plus' }) {
  const t = TIER_LINES[tier]
  return (
    <ScoutLayout preview={`You're on ${t.name} now. Thank you, seriously.`}>
      <Text style={bodyText}>Hey {'{{first_name}}'},</Text>
      <Text style={bodyText}>
        Thank you for upgrading, seriously. Scout is a student-built project, and
        your subscription is what keeps it running.
      </Text>
      <Text style={bodyText}>
        You&apos;re on <strong>{t.name}</strong> now: {t.unlocked}
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href="{{cta_url}}" style={ctaButton}>
          Start a Scout run &rarr;
        </Button>
      </Section>
      <Text style={bodyText}>
        One ask: reply and tell me the one thing you wish Scout did that it
        doesn&apos;t yet. The roadmap is built from these replies more than anything
        else.
      </Text>
      <Signature />
    </ScoutLayout>
  )
}
