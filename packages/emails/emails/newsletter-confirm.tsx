import { Button, Link, Section, Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText, ctaButton } from './_layout'

/**
 * Newsletter confirm — fired once, immediately, when someone subscribes via the
 * landing-page form (core/newsletter.py, NOT the Clerk account-signup path, so this
 * never doubles up with the account welcome email). {{{RESEND_UNSUBSCRIBE_URL}}} is
 * Resend's own merge tag: it only resolves to a working link because the recipient is
 * already in the newsletter segment by send time (core/newsletter.py adds them first).
 */
export default function NewsletterConfirmEmail() {
  return (
    <ScoutLayout
      preview="A couple times a month. Internship tactics and Scout updates, nothing more."
      footer={
        <>
          You&apos;re receiving this because you subscribed to the Scout newsletter.{' '}
          <Link
            href="{{{RESEND_UNSUBSCRIBE_URL}}}"
            style={{ color: '#71717a', textDecoration: 'underline' }}
          >
            Unsubscribe
          </Link>
        </>
      }
    >
      <Text style={bodyText}>Hey there,</Text>
      <Text style={bodyText}>
        Thanks for signing up. I&apos;m Tindi, founder and CEO of Scout.
      </Text>
      <Text style={bodyText}>
        You&apos;ll hear from me a couple times a month: internship tactics that
        actually work, plus Scout product updates. Nothing more, no daily noise.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href="{{cta_url}}" style={ctaButton}>
          Try Scout &rarr;
        </Button>
      </Section>
      <Text style={bodyText}>
        Got a question or a tip worth sharing? Just reply. It lands in my actual
        inbox.
      </Text>
      <Signature />
    </ScoutLayout>
  )
}
