import { Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText } from './_layout'

/**
 * OTP heads-up — fired from the AgentMail webhook when a verification-code email
 * arrives for one of the user's applications. Pure reassurance: Scout's agent is
 * fetching and entering the code, the user does nothing. Deliberately NO button
 * and no code content — the whole point is "ignore this step".
 * Runtime tokens ({{first_name}}, {{company}}) via packages/api/core/email.py.
 */
export default function OtpNoticeEmail() {
  return (
    <ScoutLayout
      preview="Scout is handling a quick verification step — nothing needed from you."
      footer="You're receiving this because Scout is submitting an application on your behalf."
    >
      <Text style={bodyText}>Hey {'{{first_name}}'},</Text>
      <Text style={bodyText}>
        {'{{company}}'} asked for a quick email verification code as part of your
        application. That&apos;s routine — Scout&apos;s agent is already grabbing
        the code and entering it for you.
      </Text>
      <Text style={bodyText}>
        Nothing needed from you. If any verification-code emails show up in your
        inbox, you can safely ignore them.
      </Text>
      <Signature />
    </ScoutLayout>
  )
}
