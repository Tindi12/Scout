# Scout — Claude Code Context

## What Scout Is
Scout is an AI-powered internship application agent for CS and 
engineering students. It parses resumes, scores them, rewrites 
them in Jake format, matches students to internships, and 
autonomously applies on their behalf via browser automation.

## Monorepo Structure
packages/web/     → Next.js 15 App Router (Vercel)
packages/api/     → FastAPI Python backend (Railway)
packages/emails/  → React Email templates (@react-email) → built to packages/api/templates/email
supabase/         → README only; schema on Supabase (scout-dev), not repo SQL files

## Tech Stack
- Frontend: Next.js 15, Tailwind, shadcn/ui, Framer Motion, Clerk, Supabase JS
- Backend: FastAPI, Python 3.11, Supabase Python, Groq, Gemini
- Database: Supabase (PostgreSQL + pgvector + RLS)
- Queue: Celery + Redis
- Job sources: Adzuna + JSearch (RapidAPI) — see services/job_fetcher.py
- Email: Resend (transactional, via core/email.py); AgentMail runs the shared inbox
  that relays ATS verification codes mid-apply (core/agentmail_inbox.py)
- Observability: Sentry (core/observability.py) + PostHog (core/analytics.py)
- Browser automation: browser-use on Browserbase SESSIONS (services/browser_agent.py,
  default engine — uncapped, billed in browser-minutes). The hosted Browserbase Agents
  engine (services/browserbase_agent.py) is quota-capped (15 runs/period on the
  Developer plan) and kept only as the SCOUT_APPLY_ENGINE=hosted fallback.
  Browser-agent LLM (services/browser_llm.py): code default is the ChatBrowserUse gateway
  (BROWSER_USE_API_KEY) with OpenAI fallback, but prod/local runs set SCOUT_BROWSER_LLM=openai
  so OpenAI gpt-5.5 is the DEPLOYED primary (see the browser-llm-apply-engine memory).
  Per-ATS Playwright adapters were removed.
  Engine env knobs: SCOUT_APPLY_ENGINE (browser_use|hosted), SCOUT_BROWSER_LLM
  (browser_use|openai), BROWSER_USE_API_KEY, SCOUT_BROWSER_FLASH_MODE,
  SCOUT_AGENT_MAX_STEPS, BROWSERBASE_REGION (match the Railway worker region —
  every CDP round-trip pays worker↔browser latency).
- Payments: Stripe — implemented (Checkout + Customer Portal + webhook). Client in
  core/stripe_client.py, routes in routes/stripe_router.py; plan/entitlement logic in
  core/subscription.py + core/entitlements.py; per-tier app credits in
  services/application_credits.py.
- Deployment: Vercel (web) + Railway (api). Production deploy is the remaining Epic 11 work.

## AI Architecture
All AI calls go through packages/api/core/ai_router.py
- Chat order: Gemini multi-model chain → Groq multi-model chain (see core/gemini_models.py, core/groq_models.py)
- Gemini chat (power → volume): 3 Flash → 2.5 Flash → 3.1 Flash Lite → 2.5 Flash Lite → Gemma 4 31B → Gemma 4 26B
- Groq fallback: compound 70k TPM → scout 30k → task-specific 8b/70b/oss
- Embeddings: OpenAI ada-002 (primary) → Gemini Embedding 2 → Gemini Embedding 1 (1536 dims)
- User-facing errors summarized in core/ai_errors.py (no raw provider dumps)
- Never call AI directly from endpoints — always use call_ai()

## Auth Pattern
- Clerk handles authentication
- JWT tokens verified in FastAPI via core/auth.py verify_clerk_jwt
- Tier gates: core/entitlements.py — require_paid (any paid tier) and require_scout_plus,
  both built from the require_tier(min_tier) factory
- Next.js proxy routes forward requests to FastAPI with Bearer token
- Never expose FastAPI URL directly to browser

## Database Rules
- Service role key: server-side only (FastAPI + Next.js server actions)
- Anon key: browser-side only
- All tables have RLS enabled
- User ownership verified on every query
- Never trust user-supplied IDs without ownership check

## Secrets at Rest
- users.usajobs_password is symmetric-encrypted (Fernet) via core/crypto.py — it's a
  reusable login the agent must replay, so it's encrypted, not hashed.
- USAJOBS_ENC_KEY must be set in Railway (prod) and locally. Generate with
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
- Encrypt-on-write is the FastAPI PUT /user/usajobs-credentials path (key stays
  Railway-only, so this write does NOT go through a Next.js server action).
- Decrypt only in the worker, in-memory, at point of use — see the seam in
  tasks/job_tasks.py. Never log the plaintext or ciphertext; never return it in any
  API response (it's excluded from /api/user/me and profile reads).
- Rotating USAJOBS_ENC_KEY requires re-encrypting existing values (not yet built):
  scripts/migrate_usajobs_password_encrypt.py is the encrypt-in-place migration.

## Pricing Tiers
- Free: 10 lifetime applications, resume parse + score only
- Pro ($14.99/mo): 40 apps/30 days, full Scout Agent, rewrites
- Scout+ ($29.99/mo): 100 apps/30 days, priority everything

## Current Build Status
Features are built; the app is in pre-launch (deploying to production). Epic/issue
tracking lives in GitHub — check `gh issue list` for the live picture.
- Epic 1-5: Complete (auth, onboarding, resume parse/score/rewrite, LaTeX PDF)
- Epic 6 — Job Discovery: Complete (Adzuna + JSearch fetch, pgvector embeddings, matcher, Explore)
- Epic 7 — Scout Agent: Complete (browser-use on Browserbase; portal detector; Celery apply task).
  NOTE: the earlier per-ATS MCP servers (Greenhouse/Lever/Workday/Ashby/USAJobs) were
  REPLACED by the single browser-use engine — don't reintroduce them.
- Epic 8 — Notifications: Complete (Resend email, tracker, follow-up reminders).
  Open: #206 [8.7] SMS on run completion (optional).
- Epic 9 — AI Copilot: Complete (SSE chat on ai_router, persistence, free-tier gate)
- Epic 10 — Stripe payments: Complete (Checkout, Portal, webhook, require_paid gate, /pricing)
- Epic 11 — Polish & Production Launch: IN PROGRESS. Polish shipped (Framer Motion,
  skeletons, empty states, mobile audit, Sentry, PostHog, security audit). REMAINING =
  deployment (#198-#205): Supabase prod + migrations, Railway (FastAPI+Celery), Vercel,
  prod CORS, Stripe prod webhook, custom domain, full e2e smoke, ship.
- Epic 12 (post-launch, #209): not started

## Known WIP / stubs
- services/strategy_engine.py (StrategyEngine.weekly_plan) + routes/strategy.py are
  scaffolded but raise NotImplementedError — not a live feature yet.
- Ashby "possible spam" flag on the apply agent: CONFIRMED cause is the plan-gated
 device/CDP fingerprint (see core/browserbase.py docstring + the ashby-spam-fingerprint
 memory). Live validation 2026-07-14: two clean-form retries with block_ads off + geo
 residential proxy + verified upload were still spam-flagged, ruling out everything but
 browser identity. The mitigations (browser timezone match, OS/UA spoof) require the
 Browserbase Enterprise plan — staying on Developer by decision. Handled product-side:
 spam_blocked is terminal (non-retryable), goes to needs_attention, and the tracker
 shows an "Apply manually" link to the job page instead of a Retry button.

## Key Files
Core / AI
- packages/api/core/ai_router.py — all AI routing
- packages/api/core/auth.py — JWT verification + Pro gate
- packages/api/core/supabase_client.py — database client
- packages/api/core/subscription.py + core/entitlements.py — plan tiers + entitlement gates
- packages/api/core/stripe_client.py — Stripe client (checkout/portal/webhook)

Resume (Epic 1-5)
- packages/api/routes/resume.py — resume endpoints
- packages/api/services/resume_parser.py — PDF/DOCX extraction
- packages/api/services/resume_scorer.py — scoring engine
- packages/api/services/resume_rewriter.py — Jake format rewrite
- packages/api/services/latex_generator.py — PDF generation

Discovery + Apply agent (Epic 6-7)
- packages/api/services/job_fetcher.py — Adzuna + JSearch fetch
- packages/api/services/job_matcher.py + embedding_service.py — pgvector matching
- packages/api/services/portal_detector.py — ATS portal detection
- packages/api/services/browser_agent.py — browser-use apply engine (default)
- packages/api/services/browser_llm.py — apply-agent LLM gateway/fallback
- packages/api/core/browserbase.py — Browserbase session config (fingerprint/proxy notes)
- packages/api/tasks/job_tasks.py — Celery apply pipeline
- packages/api/routes/scout.py — POST /scout/run, GET /scout/status/{run_id}

Copilot / Notifications / Billing (Epic 8-10)
- packages/api/routes/copilot.py + services/copilot_context.py — SSE chat copilot
- packages/api/routes/notifications.py + services/notification_service.py — tracker + follow-ups
- packages/api/core/email.py + packages/emails/ — Resend transactional email + templates
- packages/api/routes/stripe_router.py — Stripe endpoints

Web
- packages/web/app/actions/{onboarding,resume,profile}.ts — onboarding/resume/profile server actions
- packages/web/app/(dashboard)/resume/analysis/page.tsx — analysis UI
- packages/web/app/(dashboard)/{explore,tracker,copilot,scout,settings}/ — main product pages

## Code Conventions
### FastAPI
- All endpoints use Depends(verify_clerk_jwt); paid features add Depends(require_paid)
  or Depends(require_scout_plus) from core/entitlements.py
- Pydantic models for all request bodies
- run_in_threadpool for all blocking operations (pdflatex, file I/O)
- HTTPException with specific status codes (401, 403, 404, 422, 500)
- Always verify user owns the resource before returning it

### Next.js
- Server components by default
- "use client" only when hooks or interactions needed
- Server actions for all database writes
- /api/* proxy routes for all FastAPI calls
- Never call FastAPI directly from client components

### Python
- Async functions throughout
- load_dotenv() at top of every file that reads env vars
- Fail fast: raise RuntimeError if required env vars missing
- Logger per file: logger = logging.getLogger(__name__)
- Services export singletons: resume_parser = ResumeParser()

## Commands
```bash
# Start everything (preferred on Windows — isolated processes, scoped API reload)
pnpm dev

# Two terminals if reload still feels flaky
pnpm dev:web   # :3000
pnpm dev:api   # :8000 — no reload during long AI requests: pnpm --filter api dev:stable

# Legacy concurrently runner
pnpm dev:concurrent

# FastAPI only (reloads routes/services/core/tasks only, not data/ or tests/)
cd packages/api && pnpm dev   # uv run manages the .venv — no activation needed

# Python deps (uv) — run from packages/api
uv sync          # create/refresh .venv from pyproject.toml + uv.lock
uv add <pkg>     # add a dependency (updates pyproject.toml + uv.lock)
uv lock          # re-resolve the lockfile
# Celery worker (add -B to embed beat so the stale-application reaper runs;
# run beat on EXACTLY ONE worker/instance):
#   uv run celery -A core.celery_app worker --pool=solo -B -l info

# TypeScript check
pnpm --filter web tsc --noEmit

# Lint
pnpm --filter web lint

# Email templates: edit packages/emails/emails/*.tsx, then rebuild + COMMIT the artifacts
# (the Python API only reads the built HTML/TXT in packages/api/templates/email/)
pnpm --filter emails build

# Python syntax check
cd packages/api && uv run python -m compileall .
```

## What NOT to Do
- Never hardcode localhost URLs in committed code
- Never use system Python — run Python through uv (uv run / uv sync manage .venv)
- Never store secrets in code — only os.getenv()
- Never call AI outside of ai_router.py
- Never skip ownership verification on database queries
- Never expose service role key to the browser
- Never commit .env files