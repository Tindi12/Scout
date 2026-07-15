import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  LegalLi,
  LegalPageShell,
  LegalP,
  LegalSection,
  LegalUl,
} from '@/components/legal/legal-page-shell'
import { BUSINESS_CONTACT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Privacy Policy — Scout',
  description:
    'How Scout accesses, collects, stores, uses, and shares your personal information when you use our services.',
}

const LAST_UPDATED = 'July 1, 2026'
const CONTACT_EMAIL = BUSINESS_CONTACT_EMAIL

function ContactEmail() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="text-[#FF6733] underline-offset-2 hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  )
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="text-white/95">{children}</strong>
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalP>
        This Privacy Policy describes how Scout (&quot;Scout,&quot; &quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;) accesses, collects, stores, uses, and
        shares (&quot;processes&quot;) your personal information when you use our
        website, applications, and services (collectively, the
        &quot;Services&quot;).
      </LegalP>

      <LegalP>
        Scout is an AI-powered platform that helps students and job seekers
        discover relevant jobs and internships, analyze and tailor their resumes,
        and—where you direct us to—automatically complete and submit job
        applications on your behalf.
      </LegalP>

      <LegalP>
        <Strong>Please read this Privacy Policy carefully.</Strong> By using the
        Services, you agree to the processing of your information as described
        here. If you do not agree, please do not use the Services.
      </LegalP>

      <LegalP>
        If you have questions, contact us at <ContactEmail />.
      </LegalP>

      <LegalSection id="summary" title="Summary of key points">
        <LegalUl>
          <LegalLi>
            <Strong>What we collect:</Strong> Account and profile details, resume
            content, education and work-eligibility information, job-application
            answers, and—if you choose to use our USAJobs integration—your
            USAJobs login credentials. We also automatically collect limited
            technical/usage data.
          </LegalLi>
          <LegalLi>
            <Strong>Sensitive information:</Strong> Scout collects
            work-authorization and visa-sponsorship information you provide (for
            example, citizenship or CPT/OPT status) so we can match you to
            eligible roles. We treat this information with care and use it only
            to operate the Services.
          </LegalLi>
          <LegalLi>
            <Strong>AI processing:</Strong> To analyze, score, and rewrite your
            resume and to power our AI assistant, we send relevant content to
            third-party AI providers (OpenAI, Groq, and Google).
          </LegalLi>
          <LegalLi>
            <Strong>Automated applications:</Strong> When you direct Scout to
            apply to a job, our automated agent transmits your information—including
            your resume and profile details—to the third-party job-application
            platform for that employer in order to complete and submit your
            application.
          </LegalLi>
          <LegalLi>
            <Strong>Who we share with:</Strong> We share information with the
            service providers that run our infrastructure, AI processing,
            automation, payments, authentication, and analytics. We do not sell
            your personal information, and we do not use it for third-party
            advertising.
          </LegalLi>
          <LegalLi>
            <Strong>Your rights:</Strong> You can review, update, export, or
            delete your information. See &quot;Your Privacy Rights&quot; and
            &quot;How to Review, Update, or Delete Your Data&quot; below.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="toc" title="Table of contents">
        <LegalUl>
          <LegalLi>
            <a href="#collect" className="text-[#FF6733] underline-offset-2 hover:underline">
              What Information We Collect
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#use" className="text-[#FF6733] underline-offset-2 hover:underline">
              How We Use Your Information
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#ai" className="text-[#FF6733] underline-offset-2 hover:underline">
              AI Processing of Your Information
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#automated" className="text-[#FF6733] underline-offset-2 hover:underline">
              Automated Job Applications
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#sharing" className="text-[#FF6733] underline-offset-2 hover:underline">
              When and With Whom We Share Information
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#cookies" className="text-[#FF6733] underline-offset-2 hover:underline">
              Cookies and Tracking Technologies
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#auth" className="text-[#FF6733] underline-offset-2 hover:underline">
              How We Handle Account Sign-Ups and Logins
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#retention" className="text-[#FF6733] underline-offset-2 hover:underline">
              How Long We Keep Your Information
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#security" className="text-[#FF6733] underline-offset-2 hover:underline">
              How We Keep Your Information Secure
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#international" className="text-[#FF6733] underline-offset-2 hover:underline">
              International Data Transfers
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#children" className="text-[#FF6733] underline-offset-2 hover:underline">
              Children&apos;s Privacy
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#rights" className="text-[#FF6733] underline-offset-2 hover:underline">
              Your Privacy Rights
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#data-requests" className="text-[#FF6733] underline-offset-2 hover:underline">
              How to Review, Update, or Delete Your Data
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#updates" className="text-[#FF6733] underline-offset-2 hover:underline">
              Updates to This Policy
            </a>
          </LegalLi>
          <LegalLi>
            <a href="#contact" className="text-[#FF6733] underline-offset-2 hover:underline">
              How to Contact Us
            </a>
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="collect" title="1. What information we collect">
        <LegalP>
          <Strong>Information you provide directly.</Strong> When you create an
          account and use Scout, you may provide:
        </LegalP>
        <LegalUl>
          <LegalLi>
            <Strong>Account information:</Strong> name, email address, and
            authentication details.
          </LegalLi>
          <LegalLi>
            <Strong>Profile and contact information:</Strong> phone number,
            mailing address, city, state, and country.
          </LegalLi>
          <LegalLi>
            <Strong>Education information:</Strong> university or school,
            degree, field of study, graduation date, and GPA.
          </LegalLi>
          <LegalLi>
            <Strong>Work-eligibility information:</Strong> work-authorization
            status, whether you require visa sponsorship, and related status
            information (for example, CPT/OPT eligibility). You provide this so
            we can match you to roles you are eligible for.
          </LegalLi>
          <LegalLi>
            <Strong>Resume content:</Strong> the resumes you upload, and the
            tailored or rewritten versions Scout generates.
          </LegalLi>
          <LegalLi>
            <Strong>Application answers:</Strong> responses to common application
            questions that you save for reuse (for example, &quot;why this
            company,&quot; cover-letter content, and similar free-text answers).
          </LegalLi>
          <LegalLi>
            <Strong>Third-party credentials (optional):</Strong> if you use our
            USAJobs integration, the USAJobs login credentials you provide so
            that Scout can submit applications on that platform on your behalf.
            These credentials are stored in encrypted form.
          </LegalLi>
          <LegalLi>
            <Strong>Email verification codes:</Strong> for applications submitted
            through Greenhouse, the one-time verification codes that Greenhouse
            emails to a secure Scout-managed relay address while Scout is submitting
            an application on your behalf. See &quot;Automated Job Applications&quot;
            for how this works.
          </LegalLi>
          <LegalLi>
            <Strong>Communications:</Strong> messages you send to our AI assistant
            (&quot;Copilot&quot;) and any messages you send to our support.
          </LegalLi>
          <LegalLi>
            <Strong>Payment information:</Strong> if you subscribe to a paid plan,
            your payment is processed by our payment processor (Stripe). We do
            not store full card numbers; we store limited subscription and
            billing-status information.
          </LegalLi>
        </LegalUl>
        <LegalP>
          <Strong>Information collected automatically.</Strong> When you use the
          Services, we automatically collect limited technical information such as
          IP address, browser and device characteristics, operating system,
          referring URLs, and information about how you interact with the
          Services. This is used to operate, secure, and improve the Services and
          for analytics.
        </LegalP>
      </LegalSection>

      <LegalSection id="use" title="2. How we use your information">
        <LegalP>We use your information to:</LegalP>
        <LegalUl>
          <LegalLi>Provide, operate, and maintain the Services;</LegalLi>
          <LegalLi>Create and manage your account and authenticate you;</LegalLi>
          <LegalLi>
            Parse, analyze, score, and (at your request) rewrite or tailor your
            resume;
          </LegalLi>
          <LegalLi>
            Match you to relevant jobs and internships, including filtering by
            work-eligibility;
          </LegalLi>
          <LegalLi>
            Power our AI assistant and provide guidance based on your profile and
            activity;
          </LegalLi>
          <LegalLi>
            Complete and submit job applications on your behalf when you direct
            us to;
          </LegalLi>
          <LegalLi>Process subscriptions, payments, and billing;</LegalLi>
          <LegalLi>Monitor, debug, secure, and improve the Services;</LegalLi>
          <LegalLi>
            Communicate with you about the Services and respond to your requests;
          </LegalLi>
          <LegalLi>Comply with legal obligations and enforce our terms.</LegalLi>
        </LegalUl>
        <LegalP>
          We process your information only where we have a lawful basis to do so,
          including your consent, performance of our contract with you, our
          legitimate interests in operating the Services, and compliance with
          law.
        </LegalP>
      </LegalSection>

      <LegalSection id="ai" title="3. AI processing of your information">
        <LegalP>
          Scout uses third-party artificial-intelligence providers to deliver core
          features. To do this, we send relevant content—such as your resume text,
          job descriptions, and the messages you send to our AI assistant—to these
          providers so they can return results (for example, a resume score, a
          tailored resume, or an assistant response).
        </LegalP>
        <LegalP>Our current AI processors are:</LegalP>
        <LegalUl>
          <LegalLi>
            <Strong>OpenAI</Strong>
          </LegalLi>
          <LegalLi>
            <Strong>Groq</Strong>
          </LegalLi>
          <LegalLi>
            <Strong>Google (Gemini)</Strong>
          </LegalLi>
        </LegalUl>
        <LegalP>
          These providers process the content we send on our behalf to generate
          outputs. We do not permit them to use your content to advertise to you.
          We encourage you to review each provider&apos;s own privacy practices.
          We may add or change AI providers over time and will update this
          Policy accordingly.
        </LegalP>
        <LegalP>
          We do not send your USAJobs credentials or payment card details to
          these AI providers.
        </LegalP>
      </LegalSection>

      <LegalSection id="automated" title="4. Automated job applications">
        <LegalP>
          A core feature of Scout is the ability to apply to jobs on your behalf.{' '}
          <Strong>
            When you select jobs and direct Scout to apply, you authorize us to
            transmit your personal information to the relevant third-party
            job-application platforms and to complete and submit applications
            using that information.
          </Strong>
        </LegalP>
        <LegalP>To do this:</LegalP>
        <LegalUl>
          <LegalLi>
            Our automated agent (operated using a third-party cloud-browser
            provider, <Strong>Browserbase</Strong>) opens the employer&apos;s
            application page and enters your information—such as your name,
            contact details, education, work-eligibility answers, resume, and saved
            application answers—into that application form.
          </LegalLi>
          <LegalLi>
            Your information is submitted to the employer and/or the application
            platform they use (for example, Greenhouse, Lever, Ashby, or USAJobs).
          </LegalLi>
          <LegalLi>
            Once your information is submitted to a third party, that third
            party&apos;s handling of your information is governed by{' '}
            <Strong>their</Strong> privacy practices, not ours. We do not control
            how employers or application platforms use information you submit to
            them.
          </LegalLi>
        </LegalUl>
        <LegalP>
          You are responsible for the accuracy of the information you provide and
          for your decision to apply to any particular role. You can review your
          applications in the Services.
        </LegalP>
        <LegalP>
          <Strong>Application relay address (Greenhouse applications).</Strong>{' '}
          When Scout submits an application through Greenhouse, the application
          may list a secure Scout-managed relay email address (operated by our
          inbound-email provider, <Strong>AgentMail</Strong>) as the applicant
          contact email instead of your personal address. This lets Scout
          receive the platform&apos;s one-time verification codes and complete
          your submission without needing access to your personal mailbox.
          Verification-code emails are processed automatically and are not
          forwarded or retained; any other message sent to the relay address —
          such as a recruiter&apos;s reply or an interview request — is
          forwarded to your real email address, with the reply address set to
          the original sender so that your response goes directly to them, not
          through Scout. Relayed messages are used only to deliver them to you
          and are never used for advertising, sold, or sent to any AI model.
          Applications submitted through other platforms use the email address
          on your profile.
        </LegalP>
      </LegalSection>

      <LegalSection id="sharing" title="5. When and with whom we share information">
        <LegalP>
          We do not sell your personal information. We share information only as
          described here, primarily with service providers that help us operate
          the Services:
        </LegalP>
        <LegalUl>
          <LegalLi>
            <Strong>AI providers</Strong> (OpenAI, Groq, Google) — to analyze and
            generate resume and assistant content (see Section 3).
          </LegalLi>
          <LegalLi>
            <Strong>Browser-automation provider</Strong> (Browserbase) — to
            operate the automated agent that submits applications (see Section 4).
          </LegalLi>
          <LegalLi>
            <Strong>Inbound email relay provider</Strong> (AgentMail) — to
            operate the secure relay address that receives Greenhouse
            verification codes and any recruiter replies for applications Scout
            submits on your behalf (see Section 4).
          </LegalLi>
          <LegalLi>
            <Strong>Job-application platforms and employers</Strong> (e.g.,
            Greenhouse, Lever, Ashby, USAJobs) — when you direct us to apply (see
            Section 4).
          </LegalLi>
          <LegalLi>
            <Strong>Infrastructure and database provider</Strong> (Supabase) — to
            host and store your data.
          </LegalLi>
          <LegalLi>
            <Strong>Authentication provider</Strong> (Clerk) — to manage account
            sign-up and login.
          </LegalLi>
          <LegalLi>
            <Strong>Payment processor</Strong> (Stripe) — to process subscriptions
            and payments.
          </LegalLi>
          <LegalLi>
            <Strong>Analytics provider</Strong> (PostHog) — to understand product
            usage and improve the Services.
          </LegalLi>
          <LegalLi>
            <Strong>Error-monitoring provider</Strong> (Sentry) — to detect and
            fix errors. We configure our error monitoring to exclude sensitive
            content where reasonably possible.
          </LegalLi>
        </LegalUl>
        <LegalP>We may also share information:</LegalP>
        <LegalUl>
          <LegalLi>
            <Strong>To comply with law</Strong> or respond to lawful requests and
            legal process;
          </LegalLi>
          <LegalLi>
            <Strong>To protect rights and safety</Strong>, including to enforce
            our terms and prevent fraud or abuse;
          </LegalLi>
          <LegalLi>
            <Strong>In a business transfer</Strong>, such as a merger, financing,
            acquisition, or sale of assets, in which case we will require the
            recipient to honor this Policy.
          </LegalLi>
        </LegalUl>
      </LegalSection>

      <LegalSection id="cookies" title="6. Cookies and tracking technologies">
        <LegalP>
          We use <Strong>essential cookies</Strong> to operate and secure the
          Services and remember your preferences, and{' '}
          <Strong>analytics cookies</Strong> (PostHog) to understand usage and
          improve the Services. We do <Strong>not</Strong> use cookies for
          third-party advertising.
        </LegalP>
        <LegalP>
          Analytics cookies are <Strong>off by default</Strong>. We do not load or
          send anything to our analytics provider until you accept non-essential
          cookies in our consent banner. You can change your choice at any time
          using the <Strong>“Cookie preferences”</Strong> link in the site footer;
          if you withdraw consent, analytics stops. Your choice is stored in a
          first-party <Strong>scout_cookie_consent</Strong> cookie.
        </LegalP>
      </LegalSection>

      <LegalSection id="auth" title="7. How we handle account sign-ups and logins">
        <LegalP>
          We use a third-party authentication provider (Clerk) to manage account
          creation and login. If you choose to sign in using a third-party
          account (such as Google), we receive limited profile information (such
          as your name and email address) from that provider to create and secure
          your account.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" title="8. How long we keep your information">
        <LegalP>
          We keep your personal information for as long as your account is active
          or as needed to provide the Services, and afterward only as long as
          necessary for the purposes described in this Policy, unless a longer
          period is required or permitted by law (for example, for tax, accounting,
          fraud-prevention, or legal-compliance reasons).
        </LegalP>
        <LegalP>
          When we no longer have a legitimate need to process your information, we
          will delete or anonymize it. Where deletion is not immediately possible
          (for example, information stored in backups), we will securely isolate
          it until deletion is possible.
        </LegalP>
      </LegalSection>

      <LegalSection id="security" title="9. How we keep your information secure">
        <LegalP>
          We use technical and organizational measures designed to protect your
          information, including access controls, database-level row-level
          security to isolate your data from other users, and encryption of
          particularly sensitive stored values such as your USAJobs credentials.
        </LegalP>
        <LegalP>
          No method of transmission or storage is completely secure, and we
          cannot guarantee absolute security. You are responsible for keeping your
          account credentials confidential.
        </LegalP>
      </LegalSection>

      <LegalSection id="international" title="10. International data transfers">
        <LegalP>
          We and our service providers are located primarily in the{' '}
          <Strong>United States</Strong>, and your information is processed there.
          If you access the Services from outside the United States, your
          information may be transferred to, stored in, and processed in the
          United States and other countries where our service providers operate.
          These countries may have data-protection laws different from those in
          your country. Where required, we take measures to protect your
          information in connection with such transfers.
        </LegalP>
      </LegalSection>

      <LegalSection id="children" title="11. Children&apos;s privacy">
        <LegalP>
          The Services are intended for users who are at least 18 years old. We do
          not knowingly collect personal information from children under 18. If you
          believe a child under 18 has provided us personal information, please
          contact us at <ContactEmail /> and we will take reasonable steps to
          delete it.
        </LegalP>
      </LegalSection>

      <LegalSection id="rights" title="12. Your privacy rights">
        <LegalP>
          Depending on where you live, you may have rights regarding your personal
          information, including the right to:
        </LegalP>
        <LegalUl>
          <LegalLi>Access the personal information we hold about you;</LegalLi>
          <LegalLi>Correct inaccurate information;</LegalLi>
          <LegalLi>Delete your information;</LegalLi>
          <LegalLi>Export/port your information;</LegalLi>
          <LegalLi>Withdraw consent where we rely on consent; and</LegalLi>
          <LegalLi>Object to or restrict certain processing.</LegalLi>
        </LegalUl>
        <LegalP>
          Residents of certain jurisdictions (such as the EEA, UK, and certain
          U.S. states including California) may have additional rights under
          applicable law. We do not sell your personal information or share it for
          cross-context behavioral advertising.
        </LegalP>
        <LegalP>
          To exercise any of these rights, contact us at <ContactEmail />. We
          will respond as required by applicable law. You also have the right to
          lodge a complaint with your local data-protection authority.
        </LegalP>
      </LegalSection>

      <LegalSection id="data-requests" title="13. How to review, update, or delete your data">
        <LegalP>
          You can review and update much of your information directly in your
          account settings.
        </LegalP>
        <LegalP>
          You can permanently delete your account and associated personal
          information yourself at any time from{' '}
          <Strong>Settings &rarr; Account Actions &rarr; Delete account</Strong>.
          Deletion is immediate and irreversible: it removes your profile,
          resumes, cover letters, application history, notifications, stored
          credentials, and connected email access, cancels any active
          subscription, and deletes your sign-in identity.
        </LegalP>
        <LegalP>
          To request access to or a copy of your personal information, or to
          request deletion if you cannot access your account, contact us at{' '}
          <ContactEmail />. Upon a verified deletion request, we will delete
          your account and associated personal information from our active
          systems, except where we are required or permitted by law to retain
          certain information. Note that information you have already submitted
          to employers or third-party application platforms through the
          Services is controlled by those third parties and must be addressed
          with them directly.
        </LegalP>
      </LegalSection>

      <LegalSection id="updates" title="14. Updates to this policy">
        <LegalP>
          We may update this Privacy Policy from time to time. The updated version
          will be indicated by a revised &quot;Last updated&quot; date. If we make
          material changes, we will take reasonable steps to notify you, such as by
          posting a notice in the Services or contacting you directly. We encourage
          you to review this Policy periodically.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" title="15. How to contact us">
        <LegalP>
          If you have questions or concerns about this Privacy Policy or our data
          practices, contact us at:
        </LegalP>
        <LegalP>
          <Strong>Scout</Strong>
          <br />
          <ContactEmail />
        </LegalP>
        <LegalP>
          See also our{' '}
          <Link
            href="/terms"
            className="text-[#FF6733] underline-offset-2 hover:underline"
          >
            Terms of Service
          </Link>
          .
        </LegalP>
      </LegalSection>
    </LegalPageShell>
  )
}
