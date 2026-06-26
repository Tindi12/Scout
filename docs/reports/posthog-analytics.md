# PostHog Product Analytics (Epic 11.6)

Captures the **signup → activation → paid** funnel and **feature usage**, segmentable
by tier and cohort. Separate from Sentry (11.5), which is errors only.

## How it works

- **Frontend** (`packages/web`): `posthog-js` initialized in `app/providers.tsx`
  (mounted in `app/layout.tsx`). Users are identified by their **Clerk user id** with
  coarse traits (subscription_plan, school, graduation, work_authorization). All event
  names live in `lib/analytics.ts` — `track()` is the only capture path. `autocapture`
  is **off** (Scout's DOM holds resume/answer text); only explicit events + pageviews.
- **Backend** (`packages/api`): `core/analytics.py` wraps the `posthog` Python lib for
  events that must be reliable / accurate. distinct_id is always the **Clerk id**, so
  client and server events land on the same person.
- **No-op without keys**: unset `NEXT_PUBLIC_POSTHOG_KEY` / `POSTHOG_KEY` ⇒ analytics
  is a silent no-op (local dev needs nothing).

## Event catalog (snake_case)

### Funnel
| Event | Where | Side |
|---|---|---|
| `signed_up` | Clerk `user.created` webhook | server |
| `onboarding_completed` | onboarding page submit | client |
| `resume_uploaded` | ResumeUpload after upload | client |
| `resume_scored` | ResumeUpload after analyze | client |
| `jobs_viewed` | Explore page (jobs loaded) | client |
| `scout_run_started` | Explore "Send Scout" run created | client |
| `application_completed` | apply task, status→applied | **server** |
| `upgrade_viewed` | pricing page + Pro gate dialog | client |
| `checkout_started` | `createCheckoutUrl` (Stripe checkout) | client |
| `subscription_activated` | Stripe `checkout.session.completed` webhook | **server** |

### Feature usage
| Event | Where |
|---|---|
| `copilot_message_sent` | `use-copilot-chat` send (no message content) |
| `resume_rewrite_used` | analysis page rewrite |
| `resume_tailored_for_job` | JobCardTailoredPanel generation |
| `application_manually_managed` | answer / verification code / stop-all (`action` prop) |
| `notification_clicked` | NotificationBell |
| `billing_portal_opened` | `createPortalUrl` |

**Note on tightness:** rather than minting more event names, manual-management actions
share one `application_manually_managed` event distinguished by an `action` property
(`answer_submitted` / `verification_code_submitted` / `stop_all`). `subscription_plan`
is registered as a super property, so every event is tier-segmentable without per-call
wiring.

## Privacy

Identify by id + coarse properties only. **Never** sent: resume content, answer text,
copilot message content, personal contact info. subscription_plan is updated
server-side from the Stripe webhook on upgrade/downgrade so tier segmentation stays
accurate even if the user never reloads.

## Env vars

```
# web (.env.local / Vercel)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
# api (.env / Railway)
POSTHOG_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
```

## Verifying events arrive

1. **Live events:** PostHog → **Activity → Live events**. Run the app with the keys
   set, sign in, and click through: you should see `signed_up` (new account),
   `resume_uploaded`, `resume_scored`, `jobs_viewed`, etc. appear in real time, each
   with `distinct_id` = your Clerk id.
2. **Server events:** trigger a test Stripe checkout (test card `4242 4242 4242 4242`)
   → `checkout_started` (client) then `subscription_activated` (server, from the
   webhook) should both appear on the same person. Send Scout on a job that reaches
   applied → `application_completed`. For local webhooks use the Stripe CLI
   (`stripe listen --forward-to localhost:8000/stripe/webhook`).
3. **Person properties:** PostHog → **People** → open yourself → confirm
   `subscription_plan`, `school`, `graduation`, `work_authorization` are set.
4. **Funnel is capturable:** PostHog → **Product analytics → New funnel**, add steps
   `signed_up → onboarding_completed → resume_scored → scout_run_started →
   checkout_started → subscription_activated`. Because every step is keyed by the same
   Clerk distinct_id, the funnel computes conversion across client + server events.
   Break down by the `subscription_plan` property to segment by tier.
