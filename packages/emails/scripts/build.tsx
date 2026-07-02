/**
 * Renders every Scout email to static, email-safe HTML + plain-text artifacts in
 * packages/api/templates/email/. Run `pnpm --filter emails build` after editing a
 * template and COMMIT the outputs — the Python API only reads the artifacts, so
 * Railway never needs Node.
 *
 * Runtime tokens ({{first_name}}, {{cta_url}}) survive rendering as literal text
 * and are substituted (HTML-escaped) by packages/api/core/email.py.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { render } from '@react-email/render'

import FarewellEmail from '../emails/farewell'
import NewsletterConfirmEmail from '../emails/newsletter-confirm'
import UpgradeEmail from '../emails/upgrade'
import WelcomeEmail from '../emails/welcome'

const OUT_DIR = join(import.meta.dirname, '..', '..', 'api', 'templates', 'email')

const EMAILS: { name: string; element: React.ReactElement }[] = [
  { name: 'welcome', element: <WelcomeEmail /> },
  { name: 'upgrade_pro', element: <UpgradeEmail tier="pro" /> },
  { name: 'upgrade_scout_plus', element: <UpgradeEmail tier="scout_plus" /> },
  { name: 'farewell', element: <FarewellEmail /> },
  { name: 'newsletter_confirm', element: <NewsletterConfirmEmail /> },
]

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const { name, element } of EMAILS) {
    const html = await render(element)
    const text = await render(element, { plainText: true })
    writeFileSync(join(OUT_DIR, `${name}.html`), html, 'utf8')
    writeFileSync(join(OUT_DIR, `${name}.txt`), text, 'utf8')
    console.log(`rendered ${name} (${html.length}B html, ${text.length}B text)`)
  }
}

void main()
