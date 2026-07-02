import { Button, Section, Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText, ctaButton } from './_layout'

/**
 * Welcome — fired from the Clerk user.created webhook. Runtime tokens
 * ({{first_name}}, {{cta_url}}) are substituted by packages/api/core/email.py.
 */
export default function WelcomeEmail() {
  return (
    <ScoutLayout preview="Built by a student, for students. Here's how to start.">
      <Text style={bodyText}>Hey {'{{first_name}}'},</Text>
      <Text style={bodyText}>
        I&apos;m Tindi. I built Scout because applying to internships was eating my
        life, and I figured it shouldn&apos;t have to eat yours too.
      </Text>
      <Text style={bodyText}>
        The best first move: upload your resume. Scout scores it, rewrites it
        properly, and then starts applying to matched internships for you, while
        you do literally anything else.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href="{{cta_url}}" style={ctaButton}>
          Upload your resume &rarr;
        </Button>
      </Section>
      <Text style={bodyText}>
        If anything&apos;s confusing or broken, just hit reply. This isn&apos;t a
        no-reply address. It lands in my actual inbox, and I read everything.
      </Text>
      <Signature />
    </ScoutLayout>
  )
}
