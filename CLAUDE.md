# Scout — Claude Code Context

## What Scout Is
Scout is an AI-powered internship application agent for CS and 
engineering students. It parses resumes, scores them, rewrites 
them in Jake format, matches students to internships, and 
autonomously applies on their behalf via browser automation.

## Monorepo Structure
packages/web/   → Next.js 14 App Router (Vercel)
packages/api/   → FastAPI Python backend (Railway)
supabase/       → README only; schema on Supabase (scout-dev), not repo SQL files

## Tech Stack
- Frontend: Next.js 14, Tailwind, shadcn/ui, Clerk, Supabase JS
- Backend: FastAPI, Python 3.11, Supabase Python, Groq, Gemini
- Database: Supabase (PostgreSQL + pgvector + RLS)
- Queue: Celery + Redis
- Browser automation: Browserbase + browser-use AI agent (services/browser_agent.py — agent-only; per-ATS Playwright adapters were removed)
- Payments: Stripe (not yet implemented — Epic 10)
- Deployment: Vercel (web) + Railway (api)

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
- Pro gate: core/auth.py require_pro dependency
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
- Free: 25 lifetime applications, resume parse + score only
- Pro ($14.99/mo): 200 apps/30 days, full Scout Agent, rewrites
- Scout+ ($29.99/mo): 600 apps/30 days, priority everything

## Current Build Status
- Epic 1-5: Complete
- Epic 6: Job Discovery Engine (IN PROGRESS)
- Epic 7: Scout Agent (not started)
- Epic 8: Notifications (not started)
- Epic 9: AI Copilot (not started)
- Epic 10: Stripe payments (not started)
- Epic 11: Polish + deployment (not started)

## Key Files
- packages/api/core/ai_router.py — all AI routing
- packages/api/core/auth.py — JWT verification + Pro gate
- packages/api/core/supabase_client.py — database client
- packages/api/routes/resume.py — resume endpoints
- packages/api/services/resume_parser.py — PDF/DOCX extraction
- packages/api/services/resume_scorer.py — scoring engine
- packages/api/services/resume_rewriter.py — Jake format rewrite
- packages/api/services/latex_generator.py — PDF generation
- packages/web/app/actions/onboarding.ts — onboarding server action
- packages/web/app/actions/resume.ts — resume upload server action
- packages/web/app/actions/profile.ts — profile server action
- packages/web/app/(dashboard)/resume/analysis/page.tsx — analysis UI

## Code Conventions
### FastAPI
- All endpoints use Depends(verify_clerk_jwt) or Depends(require_pro)
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
# Celery worker:  uv run celery -A core.celery_app worker --pool=solo -l info

# TypeScript check
pnpm --filter web tsc --noEmit

# Lint
pnpm --filter web lint

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