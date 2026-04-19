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
  title: 'Privacy Policy — Scout',
  description:
    'How Scout collects, uses, stores, and protects your personal data, resume information, and usage data.',
}

const LAST_UPDATED = 'April 19, 2026'

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalP>
        This Privacy Policy describes how Scout (&quot;Scout,&quot; &quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) collects, uses, discloses, and
        safeguards information when you use our website, applications, and
        related services (collectively, the &quot;Service&quot;). This policy is
        provided for transparency and operational clarity. It does not create
        rights enforceable by third parties and is not a substitute for legal
        advice tailored to your situation.
      </LegalP>

      <LegalSection id="collect" title="1. Information we collect">
        <LegalP>
          We collect information that you provide directly, information
          generated through your use of the Service, and limited technical
          information from your device.
        </LegalP>
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Account and contact data.</strong>{' '}
            Name, email address, university or school affiliation, and other
            profile fields you choose to provide. We use this to create and
            maintain your account, communicate service-related notices, and
            respond to support requests.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Resume and career data.</strong>{' '}
            Files and text you upload (for example PDF or DOCX resumes),
            structured resume content we derive from parsing, work history,
            projects, skills, application history you log in the product, and
            outputs produced by our systems (such as optimized resume variants
            tailored to specific roles).
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Usage data.</strong> Features you
            access, actions you take in the interface (including application
            submissions initiated through Scout), approximate timestamps, and
            similar telemetry that helps us operate, secure, and improve the
            Service and job-matching quality.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Device and log data.</strong> IP
            address, browser type and version, operating system, device
            identifiers where applicable, and diagnostic logs. We use this for
            security, fraud prevention, reliability, and performance
            optimization.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Payment data.</strong> If you
            subscribe to a paid plan, our payment processor handles card and
            billing details. We receive limited billing metadata (for example
            subscription status) as needed to provide the Service.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="use" title="2. How we use your information">
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Resume intelligence.</strong> To
            parse, analyze, score, rewrite, and generate job-specific resume
            variants using automated and AI-assisted processes.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Autonomous applications.</strong>{' '}
            When you instruct Scout to apply on your behalf, we transmit the
            data required by third-party applicant tracking systems and career
            portals you select (for example Greenhouse, Lever, or Workday),
            including contact fields, answers to application questions, and
            documents such as tailored resumes.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Core product features.</strong> To
            operate accounts, dashboards, application tracking, notifications,
            and conversational features such as the AI Copilot.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Analytics and improvement.</strong>{' '}
            To measure aggregate usage patterns, debug issues, train and evaluate
            models where permitted by law and our agreements, and improve
            matching and user experience. Where feasible, we use aggregated or
            de-identified data for analytics.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Security and compliance.</strong>{' '}
            To detect abuse, enforce our terms, and comply with legal
            obligations.
          </LegalLi>
        </LegalUl>
        <LegalP>
          We process personal data where we have a lawful basis under applicable
          law, such as performance of a contract with you, legitimate interests
          that are not overridden by your rights, consent where required, or
          legal obligation.
        </LegalP>
      </LegalSection>

      <LegalSection id="sharing" title="3. How we share and disclose information">
        <LegalP>
          We do not sell your personal information as that term is commonly
          understood under U.S. state privacy laws. We share information only as
          described below.
        </LegalP>
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Third-party portals and ATS.</strong>{' '}
            When you direct Scout to submit an application, we share the minimum
            information those systems require to complete the submission you
            authorized.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Service providers.</strong>{' '}
            Vendors that host infrastructure, provide databases, authentication,
            email delivery, analytics, payment processing, customer support
            tooling, or security monitoring. They may process personal data on
            our instructions and subject to contractual confidentiality and
            security obligations.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Corporate transactions.</strong>{' '}
            In connection with a merger, acquisition, financing, or sale of
            assets, personal data may be transferred as part of that transaction,
            subject to standard confidentiality arrangements.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Legal and safety.</strong> When we
            believe disclosure is required by law, regulation, legal process, or
            governmental request, or when necessary to protect the rights,
            property, or safety of Scout, our users, or others.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="rights" title="4. Your privacy rights and choices">
        <LegalP>
          Depending on where you live, you may have rights under the General Data
          Protection Regulation (GDPR), the UK GDPR, the California Consumer
          Privacy Act (CCPA) as amended by the CPRA, and other regional laws.
          Subject to verification and applicable exceptions, those rights may
          include:
        </LegalP>
        <LegalUl>
          <LegalLi>
            <strong className="text-white/95">Access and portability.</strong>{' '}
            Request a copy of the personal data we hold about you in a
            structured, commonly used format where technically feasible.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Rectification.</strong> Request
            correction of inaccurate personal data or completion of incomplete
            data.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Erasure.</strong> Request deletion
            of your account and associated personal data, subject to legal
            retention requirements.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Restriction or objection.</strong>{' '}
            Request restriction of certain processing, or object to processing
            based on legitimate interests, where the law provides for it.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Withdraw consent.</strong> Where
            processing is based on consent, you may withdraw it at any time
            without affecting the lawfulness of processing before withdrawal.
          </LegalLi>
          <LegalLi>
            <strong className="text-white/95">Non-discrimination (California).</strong>{' '}
            We will not deny goods or services, charge different prices, or
            provide a different level of service solely because you exercised
            CCPA rights, except as permitted by law.
          </LegalLi>
        </LegalUl>
        <LegalP>
          To exercise these rights, contact us at{' '}
          <a
            href="mailto:privacy@scout.ai"
            className="text-[#FF6733] underline-offset-2 hover:underline"
          >
            privacy@scout.ai
          </a>
          . We may need to verify your identity before fulfilling a request. You
          may also have the right to lodge a complaint with a supervisory
          authority in your jurisdiction.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" title="5. Retention">
        <LegalP>
          We retain personal data for as long as your account is active, as
          needed to provide the Service, and as required to comply with legal
          obligations, resolve disputes, and enforce our agreements. When data is
          no longer needed, we delete or de-identify it in accordance with our
          internal schedules and technical capabilities.
        </LegalP>
      </LegalSection>

      <LegalSection id="security" title="6. Data security">
        <LegalP>
          We implement administrative, technical, and organizational measures
          designed to protect personal data, including encryption in transit
          (TLS) for data sent over public networks, encryption at rest where
          supported by our infrastructure providers, access controls limiting
          employee and vendor access to what is necessary for their roles, and
          monitoring for unauthorized activity. No method of transmission or
          storage is completely secure; we cannot guarantee absolute security.
        </LegalP>
      </LegalSection>

      <LegalSection id="international" title="7. International transfers">
        <LegalP>
          Scout is operated from the United States. If you access the Service
          from outside the United States, your information may be transferred to,
          stored in, and processed in the United States or other countries where
          our providers operate. Where required, we use appropriate safeguards
          such as standard contractual clauses approved by relevant regulators.
        </LegalP>
      </LegalSection>

      <LegalSection id="children" title="8. Children">
        <LegalP>
          The Service is not directed to individuals under the age of 18, and we
          do not knowingly collect personal information from children. If you
          believe we have collected information from a minor, contact us and we
          will take appropriate steps to delete it.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" title="9. Changes to this policy">
        <LegalP>
          We may update this Privacy Policy from time to time. We will post the
          revised version on this page and update the &quot;Last updated&quot;
          date. For material changes, we will provide additional notice as
          required by law (for example by email or in-product notification).
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" title="10. Contact">
        <LegalP>
          Questions about this Privacy Policy:{' '}
          <a
            href="mailto:privacy@scout.ai"
            className="text-[#FF6733] underline-offset-2 hover:underline"
          >
            privacy@scout.ai
          </a>
          .
        </LegalP>
        <LegalP>
          Our{' '}
          <Link
            href="/terms"
            className="text-[#FF6733] underline-offset-2 hover:underline"
          >
            Terms of Service
          </Link>{' '}
          govern use of the Service and are incorporated by reference where
          applicable.
        </LegalP>
      </LegalSection>
    </LegalPageShell>
  )
}
