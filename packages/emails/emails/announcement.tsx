import { Button, Link, Section, Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText, ctaButton } from './_layout'

/**
 * Marketing announcement broadcast (blog / changelog / product update).
 * Sent to the newsletter Resend segment via core/broadcast.py — NOT through
 * transactional send_email(). {{{RESEND_UNSUBSCRIBE_URL}}} is required here.
 *
 * Tokens substituted by Python: {{headline}}, {{body}}, {{cta_label}}, {{cta_url}}.
 */
export default function AnnouncementEmail() {
  return (
    <ScoutLayout
      preview="{{headline}}"
      footer={
        <>
          You&apos;re receiving this because you subscribed to Scout updates.{' '}
          <Link
            href="{{{RESEND_UNSUBSCRIBE_URL}}}"
            style={{ color: '#71717a', textDecoration: 'underline' }}
          >
            Unsubscribe
          </Link>
        </>
      }
    >
      <Text style={{ ...bodyText, fontSize: '20px', fontWeight: 600, color: '#18181b' }}>
        {'{{headline}}'}
      </Text>
      <Text style={bodyText}>{'{{body}}'}</Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href="{{cta_url}}" style={ctaButton}>
          {'{{cta_label}}'}
        </Button>
      </Section>
      <Text style={bodyText}>
        Questions or feedback? Just reply — it lands in my actual inbox.
      </Text>
      <Signature />
    </ScoutLayout>
  )
}
