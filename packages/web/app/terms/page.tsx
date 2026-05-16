import type { Metadata } from 'next'
import Link from 'next/link'
import {
  LegalLi,
  LegalPageShell,
  LegalP,
  LegalSection,
  LegalUl,
} from '@/components/legal/legal-page-shell'

export const metadata: Metadata = {
  title: 'Terms of Service — Scout',
  description:
    'Terms governing your use of Scout, including accounts, subscriptions, the autonomous application agent, and limitations of liability.',
}

const LAST_UPDATED = 'April 19, 2026'

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <LegalSection id="acceptance" title="1. Acceptance of terms">
        <LegalP>
          By creating an account, accessing, or using Scout&apos;s website,
          applications, and related services (the &quot;Service&quot;), you agree
          to be bound by these Terms of Service and our{' '}
          <Link
            href="/privacy"
            className="text-[#FF6733] underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          , which is incorporated by reference. If you do not agree, you must not
          use the Service. If you are using the Service on behalf of an
          organization, you represent that you have authority to bind that
          organization.
        </LegalP>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Eligibility and your Scout account">
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Eligibility.</strong> You must be
            at least 18 years old and legally able to enter a binding contract in
            your jurisdiction.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Account.</strong> You are
            responsible for all activity under your account. Free, Pro, Scout+,
            and other plan entitlements are for the registered individual unless we
            agree otherwise in writing.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Security.</strong> You must
            maintain the confidentiality of your credentials and notify us
            promptly of suspected unauthorized access.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Accuracy.</strong> You agree to
            provide accurate registration information and keep it current.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="service" title="3. Description of service">
        <LegalP>
          Scout provides an automated agent and related tools designed to
          optimize resumes for specific roles and, where you elect and your plan
          permits, submit applications on your behalf to third-party career
          portals and applicant tracking systems (such as Greenhouse, Lever, or
          Workday). We iterate on the Service; features, integrations, and
          supported portals may change. We do not guarantee availability of any
          particular employer, listing, or outcome.
        </LegalP>
      </LegalSection>

      <LegalSection id="subscriptions" title="4. Subscriptions and fees">
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Pro plan.</strong> Autonomous
            application features and certain advanced capabilities require a
            paid Pro subscription (or successor plan) as described at checkout or
            in-product.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Payment and renewal.</strong>{' '}
            Recurring fees are charged to the payment method on file at the start
            of each billing period until you cancel.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Cancellation.</strong> You may
            cancel at any time through the billing interface or as we specify.
            Cancellation stops future renewals; pro-rated refunds for the
            current period are not standard unless required by law or expressly
            stated at purchase.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Taxes.</strong> Fees may exclude
            applicable taxes, which you are responsible for where required.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="ip" title="5. Proprietary rights">
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Platform rights.</strong> Scout
            and its licensors retain all rights in the Service, including
            software, design, branding, models, and documentation.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Your content.</strong> You retain
            ownership of your original resume and uploads. You grant Scout a
            non-exclusive, worldwide, royalty-free license to host, reproduce,
            modify, display, and process that content solely to provide, secure,
            and improve the Service—including generating optimized variants and
            submitting applications you authorize.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="conduct" title="6. User conduct">
        <LegalP>Prohibited conduct includes, without limitation:</LegalP>
        <LegalUl>
          <LegalLi>
            Reverse engineering, decompiling, or attempting to extract source code
            or model weights except where prohibited restrictions cannot be
            enforced under applicable law;
          </LegalLi>
          <LegalLi>
            Misrepresenting your experience, skills, or eligibility on any
            resume, application, or communication sent through the Service;
          </LegalLi>
          <LegalLi>
            Scraping or harvesting data about other users or third parties without
            authorization;
          </LegalLi>
          <LegalLi>
            Circumventing technical limits, security controls, or usage
            restrictions; or using the Service in violation of law or
            third-party terms.
          </LegalLi>
        </LegalUl>
        <LegalP>
          Scout may suspend or terminate accounts for material breach or risk to
          the Service or others.
        </LegalP>
      </LegalSection>

      <LegalSection id="disclaimer" title="7. Disclaimer of warranties">
        <LegalP>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot;
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCOUT DISCLAIMS ALL WARRANTIES,
          WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO
          NOT WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION OR THAT AUTOMATED
          APPLICATIONS WILL SUCCEED OR BE ACCEPTED BY EMPLOYERS OR PORTALS.
        </LegalP>
      </LegalSection>

      <LegalSection id="accuracy" title="8. Application accuracy and responsibility">
        <LegalP>
          You are solely responsible for verifying the accuracy, completeness, and
          truthfulness of all information submitted on your behalf, including
          AI-assisted or optimized content. Scout is not responsible for errors in
          automated forms, portal behavior, or the outcome of application reviews.
        </LegalP>
      </LegalSection>

      <LegalSection id="liability" title="9. Limitation of liability and indemnity">
        <LegalP>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SCOUT AND ITS AFFILIATES WILL
          NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM
          THESE TERMS OR THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY.
          SCOUT&apos;S TOTAL LIABILITY FOR CLAIMS ARISING IN ANY TWELVE-MONTH
          PERIOD WILL NOT EXCEED THE GREATER OF THE FEES YOU PAID SCOUT IN THAT
          PERIOD OR ONE HUNDRED U.S. DOLLARS (US$100) IF NO FEES WERE PAID. SOME
          JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES, OUR
          LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </LegalP>
        <LegalP>
          You will defend, indemnify, and hold harmless Scout and its affiliates
          from claims, damages, losses, and expenses (including reasonable
          attorneys&apos; fees) arising from your content, your use of the
          Service, your breach of these Terms, or your violation of third-party
          rights or law.
        </LegalP>
      </LegalSection>

      <LegalSection id="law" title="10. Governing law">
        <LegalP>
          These Terms are governed by the laws of the State of California,
          United States, without regard to conflict-of-law principles. Subject to
          mandatory rights in your jurisdiction, you consent to exclusive venue in
          the state and federal courts located in California for disputes arising
          from these Terms or the Service.
        </LegalP>
      </LegalSection>

      <LegalSection id="termination" title="11. Termination">
        <LegalP>
          You may stop using the Service and close your account as we make
          available. Scout may suspend or terminate access for material breach,
          non-payment, security risk, or legal requirement. Provisions that
          should survive termination (including intellectual property, disclaimers,
          limitations, indemnity, and governing law) survive.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" title="12. Contact us">
        <LegalP>
          Questions about these Terms:{' '}
          <a
            href="mailto:legal@scout.ai"
            className="text-[#FF6733] underline-offset-2 hover:underline"
          >
            legal@scout.ai
          </a>
          .
        </LegalP>
        <LegalP>
          These Terms together with the Privacy Policy constitute the entire
          agreement regarding the Service. If any provision is held unenforceable,
          the remainder remains in effect. You may not assign these Terms
          without our consent; we may assign them in connection with a merger,
          acquisition, or sale of assets. Failure to enforce a provision is not
          a waiver. You must comply with applicable export and sanctions laws.
        </LegalP>
      </LegalSection>
    </LegalPageShell>
  )
}
