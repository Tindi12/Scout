import { Text } from '@react-email/components'

import { ScoutLayout, Signature, bodyText } from './_layout'

/**
 * Farewell — sent inside the account-deletion orchestrator after external
 * cleanup succeeds, immediately before the users row is deleted (the address
 * must still exist). No CTA on purpose — gracious exit, text only.
 */
export default function FarewellEmail() {
  return (
    <ScoutLayout preview="Your account and data have been deleted, as you asked.">
      <Text style={bodyText}>Hey {'{{first_name}}'},</Text>
      <Text style={bodyText}>
        As you asked, your account and all your data (resumes, applications,
        everything) have been permanently deleted. Any subscription is canceled,
        and you won&apos;t be charged again.
      </Text>
      <Text style={bodyText}>
        No guilt trip, I promise. But if something didn&apos;t work or felt off,
        I&apos;d genuinely like to know. Just reply and tell me. It goes straight
        to me, and it&apos;s how Scout gets better for the next student.
      </Text>
      <Text style={bodyText}>If you ever want back in, the door&apos;s open.</Text>
      <Signature />
    </ScoutLayout>
  )
}
