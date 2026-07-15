import { Button, Hr, Section, Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText, ctaButton } from './_layout'

/**
 * Recruiter-reply forward — fired from the AgentMail webhook when a non-OTP message
 * arrives on the shared apply inbox. Runtime tokens ({{first_name}}, {{company}},
 * {{sender_line}}, {{message_body}}, {{cta_url}}) are substituted by
 * packages/api/core/email.py; {{message_body}} is pre-escaped there (recruiter
 * content is untrusted) with newlines already converted to <br />.
 *
 * The send sets Reply-To to the recruiter's real address — the copy below promises
 * that hitting reply goes straight to them, so keep the two in sync.
 */
export default function RecruiterForwardEmail() {
  return (
    <ScoutLayout
      preview="A response arrived for one of your applications."
      footer="You're receiving this because Scout relayed a message sent to your application's contact address."
    >
      <Text style={bodyText}>Hey {'{{first_name}}'},</Text>
      <Text style={bodyText}>
        Good news: you got a response to your Greenhouse application at{' '}
        {'{{company}}'}. Here&apos;s what they said:
      </Text>
      <Section
        style={{
          backgroundColor: '#f4f4f5',
          borderRadius: '8px',
          padding: '16px 20px',
          margin: '0 0 16px',
        }}
      >
        <Text style={{ ...bodyText, margin: 0, color: '#71717a', fontSize: '13px' }}>
          From: {'{{sender_line}}'}
        </Text>
        <Hr style={{ borderColor: '#e4e4e7', margin: '10px 0' }} />
        <Text style={{ ...bodyText, margin: 0 }}>{'{{message_body}}'}</Text>
      </Section>
      <Text style={bodyText}>
        Just hit reply to this email and your answer goes straight to them. Scout
        stays out of the conversation from here.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href="{{cta_url}}" style={ctaButton}>
          Open your tracker &rarr;
        </Button>
      </Section>
      <Signature />
    </ScoutLayout>
  )
}
