# Scout Apply Engine → Browserbase Agents — Migration Analysis & Implementation

> Status: **EXECUTED — full cutover, no feature flag.** Date: 2026-06-30.
> Scope: migrated Scout's job-application engine from browser-use (browser-use +
> self-managed Browserbase session + our own OpenAI LLM) to **Browserbase Agents**
> (hosted agent: create → run → poll). The browser-use engine was **deleted**, not
> kept behind a flag — Scout is all-in on the Agents platform. Reference
> implementation: the **Scout-Bench/browserbase-agent-workbench** repo (proves the
> file-upload path end-to-end against a real Ashby form).
>
> Parts 1–3 are the original analysis/plan. **Part 4 is the executed implementation +
> operations** (concurrency, prod, local testing). The phased/feature-flag proposal in
> §3.9 was **superseded** by the direct cutover in Part 4 at the user's direction.

## TL;DR verdict

The migration is **feasible**, and the one thing I flagged as a hard blocker in an
earlier draft — "hosted Agents can't upload a file to a form" — is **wrong**. The
`browserbase-agent-workbench` proves the real pattern: you don't push a file *into*
the agent; you give the agent a **URL**, its system prompt tells it to **download the
PDF into its sandbox** (`curl -L`), and then it **uploads that sandbox file into the
form's file input** with its normal browser tools. Download-to-sandbox is the bridge.
That is exactly the "agent fetches the file from a URL" design the original plan
wanted, and it already works.

What changes architecturally is small and clean: the Celery shell, the Redis
semaphore, notifications, the status lifecycle, credit enforcement, and the run
tracker all survive untouched. Only the middle — `browser_agent.apply()` and its
~1,800 lines of browser-use/CDP machinery plus our OpenAI apply-LLM — is replaced by
a create-run → poll → interpret adapter. The apply LLM cost moves off our OpenAI bill
onto Browserbase's per-run price (the one real cost unknown).

The remaining risks are **economic and behavioral**, not feasibility: per-run cost is
undocumented, and we give up the bespoke control surface (humanized typing, Lever
autocomplete-commit, geo-proxy, byte-inject upload) that we built specifically to beat
Ashby spam detection and hard React dropdowns. So: **phased, feature-flagged, per-run
switch — not a hard cutover.**

---

## Part 1 — The current apply engine, end to end

### 1.1 Enqueue path — `POST /jobs/scout/run` (`routes/jobs.py:171-275`)

1. `Depends(require_paid)` gates to Pro/Scout+ (`routes/jobs.py:174`).
2. **Credit check** (`routes/jobs.py:196-202`): `limit = get_tier_limits(plan)["application_limit"]`,
   `remaining = limit - user.applications_used`; 403 if `remaining < len(job_ids)`.
   Live `subscription_plan` is the source of truth, not the stored column.
3. Creates one `scout_runs` row (`status=pending`, counters zeroed) + one
   `applications` row per job (`status=queued`) (`routes/jobs.py:204-252`).
4. Fan-out: `apply_to_job_task.delay(scout_run_id, application_id, user_id, job_id)`
   per job (`routes/jobs.py:256-262`).
5. **Credit is spent at enqueue, not on success**: `applications_used += len(job_ids)`
   (`routes/jobs.py:264-269`). (A failed apply still consumes credit today.)

### 1.2 `apply_to_job_task` (`tasks/job_tasks.py:274-597`)

Celery task: `bind=True, max_retries=2, default_retry_delay=30, soft_time_limit=900, time_limit=960`.

- **Budget ladder** (`job_tasks.py:276-288`): agent run cap **840** < `APPLY_PIPELINE_TIMEOUT=870`
  < Celery soft **900** < hard **960** < Browserbase session **1260** (`core/browserbase.py:53`).
  Enforced in asyncio because Celery's signal-based limits are dead on the Windows
  `--pool=solo` dev worker.
- **Step 0 — pre-cancel** (`job_tasks.py:292-312`): if the row is already
  `failed`/`cancelled_by_user`, finalize and return **before** taking a slot.
- **Semaphore acquire** (`job_tasks.py:321-337`): `acquire_apply_slots`; on failure,
  re-`apply_async` a **fresh** task with a 20s countdown (deliberately not `self.retry`,
  to preserve the retry budget for session-loss).
- Clears stale cancel flag (`:344-347`); status → `in_progress`, run → `running` (`:350-352`).
- Fetches user via `select("*")` and **pops the encrypted `usajobs_password`** so
  ciphertext never reaches the agent/LLM/logs (`:354-371`) — documented Epic-7 decrypt seam.
- Fetches job, persists `job.url` on the application (`:374-384`).
- **Resume resolution** (`:390-400`): existing per-job variant → generate one now
  (`_generate_job_variant`, `:73-139`) → latest general rewrite (`:142-158`) →
  `generate_resume_pdf(...)` returns **bytes** (`services/latex_generator.py:540`).
- Portal detect (`:403`); **cover letter** (Pro/Scout+ + toggle) → `cover_letter_pdf`
  bytes or `None` (`:418-435`).
- **Apply call** (`:443-458`): `asyncio.run(asyncio.wait_for(browser_agent.apply(...), timeout=870))`;
  a `TimeoutError` becomes `browser_session_lost:` (routes into the retry path).
- **Success** (`:468-486`): status → `applied` + `applied_at`;
  `increment_scout_run_counter(applied_count)`; `notify_application(...applied)`;
  PostHog `EVENT_APPLICATION_COMPLETED`; `finalize_run_if_complete`.

### 1.3 `browser_agent.apply()` (`services/browser_agent.py:1675-1797`)

Writes resume bytes to a temp file with a **personalized basename**
(`Rabuor_Tindi_Resume.pdf`, `resume_filename()` `:836-846`) → `_build_applicant_context`
(`:1305-1396`) → `_build_apply_task` STAGE 1/2/3 prompt (`:1398-1461`) →
`_build_geolocation` (`:910-928`) → `_new_browser_session` (`:1644-1655`) →
`_run_phase_resilient` (single continuous run with bounded self-healing, `:1549-1642`)
→ `_run_phase` (browser-use `Agent`, `max_steps=55`, `step_timeout=150`, stop-all
watcher `:1494-1518`) → `_interpret_agent_result` (`:1174-1289`) → `finally`
REST-release session first, bounded `browser.kill()`, `rmtree` temp (`:1795-1797`).

- **Upload today** = base64 the resume bytes over CDP and rebuild a real `File`
  **in-page** (`_attach_resume_bytes` / `_JS_ATTACH_FILE`, `:623-693`). This bespoke
  path exists because handing a *local path* to a *remote* browser fails (the
  2026-06-11 Ashby "Failed to fetch" tab-wedge).
- **Apply LLM** (`services/browser_llm.py`): `gpt-5.4-mini` primary (`:17`), `gpt-4o`
  fallback (`:20`), on **our `OPENAI_API_KEY`**. This is the cost that moves to Browserbase.

> **Correction to the prompt's mental model:** there is no longer a "Phase A/B/C"
> handoff. It is one continuous agent run with **STAGE 1/2/3 inside a single prompt**
> (`browser_agent.py:1720-1738`), deliberately collapsed to keep the session
> short-lived and avoid mid-run session rot.

### 1.4 Integration points the migration must preserve

| Integration point | Where | Behavior to preserve |
|---|---|---|
| **Redis concurrency semaphore** | `core/concurrency.py` | Global 18, per-user 5, TTL 1200s backstop (`:49-53`); atomic all-or-nothing Lua acquire over both sets (`:65-90`); released in task `finally` (`job_tasks.py:590-595`); **fails open** if Redis down (`:139-140`). |
| **Notifications** | `services/notification_helpers.py` | `application_applied` / `_failed` / `_needs_attention` / `_awaiting_code` (`:12-17`); `notify_scout_run_finished` (`:102-141`). `awaiting_code` currently fired from **inside the agent tool** (`browser_agent.py:545-549`). |
| **Status lifecycle** | `applications.status` | `queued → in_progress → applied \| failed \| needs_attention \| awaiting_code`; written at each transition (`job_tasks.py:350,469,489,544,581`; `browser_agent.py:542,583`). |
| **Credit / tier** | `routes/jobs.py:196-269`, `core/subscription.py:39-43,65-68` | Pre-enqueue check + `applications_used` increment; tiers free 25 / pro 200 / scout+ 600. |
| **scout_run counters + tracker** | `increment_scout_run_counter` RPC + `finalize_run_if_complete` (`job_tasks.py:240-271`) | `applied_count`/`failed_count`/`needs_attention_count`; auto-finalize when all apps terminal; tracker reads `GET /jobs/scout/runs/{id}` (`routes/jobs.py:277-313`), UI polls every 5s. |
| **CAPTCHA / needs_attention** | `browser_agent.py:1187-1217,1280-1289` → `NeedsAttentionException` (`job_tasks.py:33-40,459-460,488-509`) | spam / captcha / verification-timeout / unconfirmed → `needs_attention`, never auto-retried. |
| **Retry / session-loss / timeout ladder** | `job_tasks.py:511-588` | `browser_session_lost:` → `self.retry` (180s backoff) while retries remain, else terminal (`:525-551`); billing/quota → no-retry (`:553-571`); everything else → deterministic no-retry (`:573-588`). |
| **Verification-code relay** | `browser_agent.py:490-609` + `routes/applications.py:174-235` + `core/redis_client.py` | `awaiting_code` status + Redis mailbox `apply:code:{id}`; agent polls up to 3×2min. |
| **Stop-all** | `routes/applications.py:238-320` | DB flip to `cancelled_by_user` (catches queued) + Redis `apply:cancel:{id}` flag (catches live runs via the watcher). |

### 1.5 Resume-file flow (specifically)

The tailored resume is **generated on the fly as bytes** in the task
(`_generate_job_variant` → `generate_resume_pdf` → bytes, `job_tasks.py:390-400`),
passed in-memory to `apply(resume_pdf=...)`, written to a **worker-local temp file**
(`browser_agent.py:1686-1701`), and byte-injected in-page. **There is no Supabase
Storage object and no URL for the tailored resume today** — the `resumes` bucket holds
only original uploads (`services/resume_parser.py:52`). The apply PDF lives only as
transient bytes. **This is the single biggest new thing the migration adds: a
short-lived, signed URL for a generated PDF.**

---

## Part 2 — The target: Browserbase Agents (confirmed against the workbench)

### 2.1 API shape — confirmed by `browserbase_client.py`

Base `https://api.browserbase.com/v1`, auth header `x-bb-api-key`.

| Call | Method / path | Payload / returns |
|---|---|---|
| Create agent | `POST /agents` | `{name, systemPrompt, resultSchema}` → `{agentId}` (reusable template). |
| Update agent | `PATCH /agents/{id}` | `{name?, systemPrompt?, resultSchema?}` — sync config without recreating. |
| Run agent | `POST /agents/runs` | `{task, agentId, variables, resultSchema, browserSettings:{proxies:true}}` → `{runId, agentId, sessionId}`. |
| Get run | `GET /agents/runs/{id}` | → `{status, sessionId, result, cause}`. |
| List messages | `GET /agents/runs/{id}/messages?since=&limit=` | streaming transcript (`data[]`, `nextSince`). |

- **Lifecycle:** `PENDING → RUNNING → COMPLETED | FAILED | STOPPED | TIMED_OUT`.
  `TERMINAL_STATUSES = {COMPLETED, FAILED, STOPPED, TIMED_OUT}` (`config.py`). Poll
  Get-Run every ~3s until terminal, then read `result` (or `cause` on failure)
  (`browserbase_client.py: poll_run`).
- **`resultSchema`** — JSON Schema → typed `result`. Replaces our fragile free-text
  `done`-message parsing.
- **`variables`** — `{"name": {"value": ..., "description": ...}}`, referenced in the
  system prompt as `%name%`. Values are substituted operationally (a tool can `curl`
  them) **without appearing inline in the agent's reasoning transcript** — ideal for
  PII. Because the system prompt is a **static** per-agent template, variables are
  *also* how every **per-run dynamic value** (the job URL, the resume URL, applicant
  fields) is injected. This is the key structural shift from our inline
  `_build_applicant_context`.
- Each run gets a **dedicated Browserbase session** (`sessionId` in the response) →
  Live View / Session Replay / logs.

### 2.2 §2.4 REVISED — file upload **works** (this reverses the earlier blocker)

An earlier draft read the docs' "you can't upload files *to an agent* yet" as "the
agent can't upload files to a form." **That was wrong.** The docs statement means you
can't push a local file into the agent over the API. The workbench shows the actual,
working pattern:

1. Pass the resume as a **URL** in `variables` (`%resumeUrl%`).
2. The **system prompt instructs the agent to download it into its sandbox**:
   *"Download the resume from `%resumeUrl%` into the sandbox workspace. Use shell
   `curl -L` if the browser download is awkward."* (`config.py: SYSTEM_PROMPT` step 1).
3. The agent then **uploads that sandbox file to the form's file input** with its
   normal browser tools: *"Upload the downloaded resume PDF to the resume/CV file
   upload field. If the file input is hidden, use the visible upload button or
   drag-and-drop area."* (step 6).
4. The run returns structured `result` incl. `resumeUploaded: bool`
   (`config.py: RESULT_SCHEMA`).

The workbench's `DEFAULT_APPLICATION_URL` targets a real **Ashby** application — the
exact ATS Scout fought for spam handling — and the README states the resume source is a
**"Supabase signed URL or public PDF link."** So the download-then-upload bridge is
proven on the ATS family we care about. **Feasibility confirmed.**

### 2.3 Cost & data-retention notes

- **Cost model** is not published per-run; must be measured (see Risks).
- Agents are currently **outside ZDR / BYOS**. Our runs carry resume PII, so this
  needs a privacy sign-off. (It does not block a spike or a canary.)

---

## Part 3 — Migration plan (proposed, not implemented)

### 3.1 Integration-point mapping (mostly "keep as-is")

The task shell stays the orchestrator; only `browser_agent.apply()` is swapped for a
new `bb_agent_apply(...)` that returns the **same contract**
(`{success, error_code, needs_attention, attention_question}`), so everything around
it is untouched.

```
acquire slot (core/concurrency.py — UNCHANGED)
  → mint short-TTL signed URLs for resume (+ cover letter)   [NEW]
  → POST /agents/runs(agentId, task, variables, resultSchema, browserSettings)
  → poll GET /agents/runs/{id} every ~3s until terminal,
      honoring the Redis cancel flag AND the 870s pipeline deadline
  → map result → application status / counters / notifications  [UNCHANGED helpers]
finally: release slot (UNCHANGED) + best-effort delete storage objects  [NEW cleanup]
```

**Terminal-state → Scout status mapping:**

| Agent run | `result` | Scout outcome |
|---|---|---|
| `COMPLETED` | `submitted=true` (+ confirmation) | `applied` |
| `COMPLETED` | `submitted=false`, blocker = captcha/spam/needs-input | `needs_attention` (never retry) |
| `COMPLETED` | submission unconfirmed | `needs_attention` (never retry — avoid duplicate apply) |
| `FAILED` | — | `failed` (deterministic, no retry) |
| `TIMED_OUT` | — | treat as `browser_session_lost:` → existing retry ladder |
| `STOPPED` | — | `cancelled_by_user` (no retry) |

- **Semaphore** still gates concurrent runs (each run = one Browserbase session), so
  it still protects the 25-session ceiling. TTL backstop still needed (a worker can die
  mid-poll).
- **Stop-all**: DB-flip path unchanged. The live-run kill maps to a **stop-run** call
  (drives the `STOPPED` state) instead of the Redis-flag → `agent.stop()` watcher; the
  poll loop checks the cancel flag each tick and issues the stop.
  ⚠️ *The exact stop endpoint path isn't shown in the workbench — confirm in Phase 0.*

### 3.2 Resume + cover-letter delivery via short-TTL signed URLs

This is the main **new infrastructure** (today there is no object/URL, §1.5):

1. After `generate_resume_pdf(...)` returns bytes, **upload to a private bucket** —
   e.g. `apply-artifacts/{user_id}/{application_id}/{personalized_name}.pdf`. **Private,
   RLS-locked, never a public bucket.**
2. Mint a **short-TTL signed URL** (`createSignedUrl`), pass it as the `%resumeUrl%`
   variable. This *is* "temporarily public, like the resume in the workbench" done
   safely: an expiring, unguessable URL to a private object — not a public bucket ACL.
   > **TTL sizing:** the prompt said ~10 min, but the run can sit `PENDING` before the
   > agent downloads. Size the TTL to the **run budget, ~20 min (1200s)** to match the
   > Browserbase session timeout (`core/browserbase.py:53`) so a queued run never gets a
   > dead URL. Still short, still unguessable, still auto-expiring.
3. Keep the **personalized basename** in the object key so the ATS records a
   presentable filename (the spam-tell defense from `resume_filename()`).
4. **Best-effort delete** the object(s) in the task `finally` (defense-in-depth beyond
   expiry).

### 3.3 Cover letter — generate on the fly, then same URL mechanism

Mirror the resume path, gated exactly as today:

1. Cover letters stay **Pro/Scout+ + `generate_cover_letters` toggle** only
   (`_cover_letters_enabled`, `job_tasks.py:161-165`).
2. If enabled, generate on the fly with **our AI models** (Gemini→Groq via
   `core/ai_router.py` → `cover_letter_writer.generate`, then `generate_cover_letter_pdf`
   → bytes, `job_tasks.py:419-435`). **This stays on our AI stack — it is content
   generation, not the apply LLM.**
3. Upload the CL PDF to the same private `apply-artifacts` bucket, mint a second
   short-TTL signed URL, pass it as a `%coverLetterUrl%` variable.
4. Extend the system prompt with cover-letter steps: *download `%coverLetterUrl%` if it
   is non-empty; if the form has a cover-letter **file** field, upload it there; a
   cover-letter **text** box is an open-ended text answer, not an upload.*
5. **Conditional variable handling:** the system prompt is static, so `%coverLetterUrl%`
   must be safe when there is no cover letter. Always pass the variable, using an
   **empty string** when none was generated, and instruct the agent to **skip the
   cover-letter upload when it is empty** (the same graceful-degradation the current
   code has when `cover_letter_pdf is None`). Result schema gains a
   `coverLetterUploaded: bool` field.

Net: the free path and the "cover-letter-off" paid path send one variable
(`%resumeUrl%`); the enabled path sends both. No agent-template change per run.

### 3.4 Sensitive fields & USAJobs creds via `variables`

Pass PII (email, phone, address) and — at the Epic-7 seam — the **decrypted USAJobs
password** as `variables` `%placeholder%` entries instead of inlining them the way
`_build_applicant_context` does today (`browser_agent.py:1347-1396`). Values are used
operationally but kept out of the transcript. This is a genuine improvement and matches
the CLAUDE.md "decrypt at point of use, never log" rule (`job_tasks.py:360-371`).

### 3.5 Submit control (reliable, deliberate, per-run)

- The **system prompt** encodes the invariant: never submit until the resume upload is
  confirmed and required fields are satisfied; report the confirmation text.
- A per-run **variable/flag** selects `SUBMIT` vs `STOP_BEFORE_SUBMIT` (dry run), and
  `resultSchema` distinguishes `submitted=true` from `submitted=false` +
  `status=partial`, so we trust a typed boolean instead of parsing prose (the workbench
  already returns `submitted` + `resumeUploaded` + `confirmationMessage`).
- **`awaiting_code`**: the live Redis code relay (`browser_agent.py:490-609`) has **no
  hosted-agent equivalent** — we can't inject a tool that flips DB status and blocks
  mid-run. Options: (a) instruct the agent to stop with `blocker=verification_code`
  → surface as `needs_attention` (loses the live relay), or (b) **keep
  verification-code ATSs on the legacy engine via the feature flag.** Recommend **(b)**
  initially.

### 3.6 What OpenAI is still used for

- **Stays on our OpenAI bill:** embeddings (ada-002), resume scoring/rewrite,
  cover-letter writing, Copilot — all via `core/ai_router.py`, untouched.
- **Moves to Browserbase:** the **apply-step LLM** (`gpt-5.4-mini` + `gpt-4o` fallback,
  `services/browser_llm.py`). Confirmed: the apply LLM cost leaves our OpenAI bill and
  becomes Browserbase per-run cost.

### 3.7 DELETE vs KEEP

**Deleted once the new engine is proven (kept dormant behind the flag until then):**

- `services/browser_agent.py` — browser-use `Agent`, custom `Tools`, byte-inject
  upload, verification relay, cancel watcher, result interpreter (~1,800 lines).
- `services/browser_llm.py` — our apply-LLM OpenAI calls.
- `core/browserbase.py` `create_session`/`release_session` — Agents manage their own
  session (keep the file only if any non-agent code still creates sessions).
- browser-use / Playwright deps (`packages/api/pyproject.toml`).
- `available_file_paths`, the STAGE 1/2/3 prompt builder, all CDP self-healing /
  session-loss token tables.

**Kept:** Celery task shell, `core/concurrency.py`, `notification_helpers`, status
lifecycle, credit enforcement (`routes/jobs.py`), counters / tracker /
`finalize_run_if_complete`, stop-all endpoint, verification-code endpoint (if path (b)).

### 3.8 Risks & unknowns

1. **Per-run cost (highest)** — undocumented; could exceed `gpt-5.4-mini` per apply.
   Measure in the spike and canary before any default flip.
2. **Hard forms** — the Five9 React dropdown, Lever clear-on-blur location field, and
   Ashby anti-spam were won with **bespoke** code (autocomplete-commit
   `browser_agent.py:363-387`, humanized trusted typing `:226-301`, geo-proxy
   `:910-928`, byte-inject upload `:623-693`). A hosted agent removes that control
   surface — we can only steer via the system prompt + `browserSettings.proxies`. Real
   regression risk on exactly the forms we fought hardest to win. **A/B the win-rate.**
3. **needs_attention / CAPTCHA surfacing** — agents solve CAPTCHAs internally but
   expose no mid-run "blocked" callback; we learn only at terminal state via `result`.
   The `awaiting_code` live relay is lost (§3.5).
4. **Data retention** — Agents outside ZDR/BYOS while carrying resume PII → compliance
   sign-off.
5. **Stop endpoint** — not shown in the workbench; confirm the stop-run call so
   Stop-All still aborts live runs.
6. **Rollback** — mitigated by the feature flag: flip the default back to legacy
   per-run instantly; keep the legacy engine present until win-rate + cost are proven.

### 3.9 Phased plan with a per-run feature flag

**Feature-flag design.** Add an `apply_engine` selector resolved **per run**, in
priority order, defaulting to `browser_use`:

1. env `SCOUT_APPLY_ENGINE` (`browser_use` | `bb_agent`) — global default (mirrors the
   existing `SCOUT_HUMANIZED_TYPING` env pattern, `browser_agent.py:110`);
2. optional per-user override column (staff / beta cohort);
3. optional `portal`-scoped rule (e.g. Greenhouse/Ashby → `bb_agent`;
   USAJobs / verification-code ATSs → `browser_use`).

Resolved once in `apply_to_job_task`, recorded on the application row for A/B
attribution (win-rate, duration, cost). The task branches to the unchanged
`browser_agent.apply(...)` or the new `bb_agent_apply(...)`; both honor the same
`apply()` contract so the semaphore / notifications / status / retry code around them
does not change.

- **Phase 0 — Spike (this workbench, extended):** run the workbench against Greenhouse
  + Ashby + Lever with a Supabase signed URL; capture per-run **cost**, duration,
  win-rate; confirm the **stop-run** endpoint and cover-letter second-file upload.
  Go / No-Go on cost + win-rate.
- **Phase 1 — Parallel adapter behind the flag (default off):** implement
  `bb_agent_apply` (create/poll/interpret), the signed-URL upload + cleanup for resume
  **and** cover letter, `resultSchema`, `variables`; add the flag; wire A/B fields.
  Legacy stays default.
- **Phase 2 — Canary:** route one internal cohort or one easy portal (Greenhouse) to
  `bb_agent`; compare win-rate / duration / cost / needs_attention mix against the
  legacy baseline (`docs/reports/concurrency-analysis.md` is the perf-baseline sibling).
- **Phase 3 — Portal-by-portal promotion:** flip defaults per portal where Agents match
  or beat legacy. Keep hard / verification-code ATSs on legacy.
- **Phase 4 — Deprecate:** once proven across the portal mix, delete the §3.7 legacy
  code and drop browser-use / Playwright deps. Not before.

---

## Appendix A — Workbench reference (`Scout-Bench/browserbase-agent-workbench`)

- **`browserbase_client.py`** — thin `requests` client: `create_agent` (`POST /agents`),
  `update_agent` (`PATCH /agents/{id}`), `run_agent` (`POST /agents/runs`,
  `browserSettings={"proxies": True}`), `get_run`, `list_messages`
  (`GET /agents/runs/{id}/messages`), and `poll_run` (3s loop until
  `TERMINAL_STATUSES`, streaming transcript). Auth: `x-bb-api-key`.
- **`run_test.py: build_variables`** — the exact variables shape:
  `{"resumeUrl": {"value": ..., "description": ...}, "applicationUrl": {...}}`,
  referenced as `%resumeUrl%` / `%applicationUrl%`.
- **`config.py: SYSTEM_PROMPT`** — 10-step "download resume → parse → fill → upload →
  submit → confirm" recipe (the download-to-sandbox-then-upload bridge).
- **`config.py: RESULT_SCHEMA`** — typed output: `status`, `submitted`, `candidateName`,
  `fieldsFilled`, `resumeUploaded`, `confirmationMessage`, `notes`
  (required: `status`, `submitted`, `resumeUploaded`).
- **`config.py: DEFAULT_APPLICATION_URL`** — a live **Ashby** application (the ATS we
  care about).
- **README** — resume source is a *"Supabase signed URL or public PDF link"*, confirming
  the signed-URL delivery path.

## Appendix B — Scout files touched by the migration

| File | Role | Migration action |
|---|---|---|
| `routes/jobs.py:171-275` | enqueue + credit | keep |
| `tasks/job_tasks.py:274-597` | orchestrator | keep shell; swap the `apply()` call for `bb_agent_apply` behind the flag; add signed-URL mint + cleanup |
| `services/browser_agent.py` | browser-use engine | keep dormant → delete in Phase 4 |
| `services/browser_llm.py` | apply LLM (OpenAI) | delete in Phase 4 |
| `core/browserbase.py` | session create/release | delete if unused elsewhere |
| `core/concurrency.py` | semaphore | keep unchanged |
| `services/notification_helpers.py` | notifications | keep unchanged |
| `routes/applications.py` | stop-all / code / answer | keep; stop-all issues stop-run |
| `services/latex_generator.py:540,654` | PDF generation | keep (now feeds storage upload) |
| `core/subscription.py` | tier limits | keep unchanged |
| _new_ storage bucket `apply-artifacts` | signed-URL PDF delivery | **add (private, RLS)** |

---

## Part 4 — Implementation (executed) + operations

### 4.1 What changed

**Added**
- `core/browserbase_agents.py` — thin REST client for the Agents API (`create_agent`,
  `update_agent`, `run_agent`, `get_run`, `stop_run`) using `requests` + the
  `x-bb-api-key` header; process-wide lazy singleton (`get_client`).
- `core/apply_storage.py` — private `apply-artifacts` bucket (idempotent ensure),
  `upload_and_sign` (upsert + short-TTL signed URL), `delete_objects`. Signed-URL TTL
  = **1200s** (`APPLY_ARTIFACTS_URL_TTL`), sized to the run budget so a `PENDING` run
  never gets a dead URL.
- `services/browserbase_agent.py` — the new engine: `SYSTEM_PROMPT` + `RESULT_SCHEMA`
  (typed output), the ported profile→answer helpers, `_build_applicant_context`,
  run assembly (`variables` = `applicationUrl` / `resumeUrl` / `coverLetterUrl`),
  proxy/geo `browserSettings`, and `apply()` = upload→run→poll→interpret→cleanup.
  Exposes `browserbase_agent` + `resolve_apply_company` (unchanged import surface for
  the task).
- `scripts/sync_browserbase_agent.py` — create/update the reusable agent template and
  print the id to pin as `BROWSERBASE_AGENT_ID`.

**Rewired**
- `tasks/job_tasks.py` — import now `from services.browserbase_agent import
  browserbase_agent, resolve_apply_company`; the apply call is a **synchronous**
  `browserbase_agent.apply(..., deadline_seconds=APPLY_PIPELINE_TIMEOUT)` (the
  `asyncio.wait_for` wrapper is gone — the deadline is enforced inside the poll loop).
  The status lifecycle, notifications, counters, retry ladder, and the `finally`
  semaphore release are **unchanged**. Budget-ladder comment updated (engine poll
  deadline 870 < Celery soft 900 < hard 960).

**Deleted**
- `services/browser_agent.py`, `services/browser_llm.py`, `core/browserbase.py`.
- Dependencies pruned: `browser-use`, `browser-use-sdk`, `browserbase`, `bubus`,
  `cdp-use` removed from `pyproject.toml`; `uv lock` + `uv sync` re-resolved (185
  packages; the whole pyobjc transitive tree browser-use pulled in is gone). The
  now-moot `[tool.uv] override-dependencies` block was removed.

**Verified:** `compileall` clean across `core/services/routes/tasks`; the rewired
modules import cleanly post-sync; no remaining references to the deleted modules.

### 4.2 How the new engine works with concurrency

**Unchanged and still authoritative — the Redis semaphore.** `apply_to_job_task` still
acquires a global + per-user slot *before* starting a run and releases it in `finally`
on every exit path (`core/concurrency.py`, `job_tasks.py:321-337,590-595`). What a slot
now governs is a **Browserbase Agent run** instead of a self-managed session — but the
1:1 "one apply = one browser session" relationship holds (each run gets a dedicated
session), so the caps still map directly onto Browserbase's concurrent-session ceiling:

- **Global cap** `APPLY_MAX_GLOBAL_CONCURRENCY=18` — fleet-wide ceiling across all
  workers (Redis-enforced), sized under the Browserbase concurrency limit.
- **Per-user cap** `APPLY_MAX_PER_USER_CONCURRENCY=5` — one user's batch can't starve
  others.
- **TTL backstop** `APPLY_SLOT_TTL_SECONDS=1200` — a worker that dies mid-poll self-heals.

**One difference worth noting:** the old engine held a real CDP WebSocket open for the
whole apply; the new engine holds an **HTTP poll loop** (`time.sleep(4)` between
`get_run` calls). A worker process is still occupied for the full apply duration (same
as before — the old code blocked on `asyncio.run` too), so per-process throughput is
unchanged, and fleet concurrency is still bounded by the semaphore, not by
`worker_concurrency`. Because the browser now runs in Browserbase's infra (not tied to
our worker's CDP link), a slow apply consumes **less** of our resources than before —
it's just a cheap poll loop, not a live CDP session our process must service.

**Stop-all** still works: the poll loop checks the Redis cancel flag each tick
(`apply:cancel:{id}`) and calls `stop_run(run_id)`, returning `cancelled_by_user` — the
same semantics as the old in-run `agent.stop()` watcher, minus the browser-use event bus.

### 4.3 How it works in prod

- **One agent template, pinned.** Run `uv run python scripts/sync_browserbase_agent.py`
  once, set `BROWSERBASE_AGENT_ID=<id>` in Railway. Every worker reuses it. Re-run the
  script (`... <agentId>`) whenever `SYSTEM_PROMPT`/`RESULT_SCHEMA` change. If the env
  var is unset, the engine creates one lazily and logs the id to pin (fine for dev, not
  ideal for prod — a fresh agent per cold worker).
- **Cost.** The apply-step LLM is gone from our OpenAI bill; per-apply model cost is now
  Browserbase's, covered by your developer plan. `OPENAI_API_KEY` is **still required**
  elsewhere (embeddings / scoring), just not for applying.
- **Runtime is process-based** (Celery prefork). The `requests.Session` singleton and
  the engine object are per-process, so there's no shared-mutable-state hazard (the old
  latent LLM-client warning is retired).
- **Env vars** (Railway): `BROWSERBASE_API_KEY` (existing), `BROWSERBASE_AGENT_ID` (new,
  recommended), `BROWSERBASE_PROXIES=true` (existing anti-spam toggle),
  `APPLY_ARTIFACTS_BUCKET` (default `apply-artifacts`), `APPLY_ARTIFACTS_URL_TTL`
  (default 1200), optional `BROWSERBASE_AGENT_POLL_INTERVAL` (default 4),
  `BROWSERBASE_AGENTS_API_BASE` (default prod). The `apply-artifacts` bucket is
  auto-created (private) on first use; nothing manual required.
- **Failure mapping** (drives status + retry, unchanged task logic): `COMPLETED`+
  `submitted` → `applied`; `spam`/`verification_code`/`captcha`/`unconfirmed` →
  `needs_attention` (no retry); `TIMED_OUT` → `browser_session_lost` → the existing
  retry-with-backoff ladder; `FAILED` → `failed`; our stop → `cancelled_by_user`.
- **Observability:** every run has a Browserbase `sessionId` (logged) → Live View /
  Session Replay in the Browserbase dashboard for debugging a bad apply. PostHog
  `EVENT_APPLICATION_COMPLETED` and Sentry capture paths are unchanged.
- **Behavioral deltas to watch** (see §4.5).

### 4.4 How to test it locally

1. **Env** (`packages/api/.env`): `BROWSERBASE_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `OPENAI_API_KEY` (embeddings). Optional:
   `BROWSERBASE_PROXIES=true`, `BROWSERBASE_AGENT_ID` (else auto-created).
2. **Create the agent:** `cd packages/api && uv run python scripts/sync_browserbase_agent.py`
   → copy the printed id into `.env` as `BROWSERBASE_AGENT_ID`.
3. **Isolated engine smoke test** (no Celery/queue needed) — call `apply()` directly
   against a real application URL with a tiny PDF:
   ```python
   # uv run python - <<'PY'
   from services.browserbase_agent import browserbase_agent
   pdf = open("sample_resume.pdf","rb").read()
   user = {"id":"local-test","name":"Test User","email":"t@example.com",
           "phone_number":"5742017358","address_city":"Rochester","address_state":"Indiana",
           "address_country":"US","school":"Test University","degree_type":"bachelors"}
   print(browserbase_agent.apply(
       job_url="https://jobs.ashbyhq.com/<some>/<posting>/application",
       user_data=user, resume_pdf=pdf, application_id="local-test", deadline_seconds=600))
   PY
   ```
   Watch the run in the Browserbase dashboard via the logged `sessionId`. This exercises
   the full path: signed-URL upload → run → poll → typed result → cleanup.
4. **Full path via the queue:** start Redis + the worker
   (`uv run celery -A core.celery_app worker --pool=solo -l info`) and the API/web
   (`pnpm dev`), then trigger a Scout run from the tracker UI. Verify: application flips
   `queued → in_progress → applied/needs_attention/failed`, the run finalizes, the
   `apply-artifacts` object is deleted after the run, and Stop-All aborts a live run
   within ~4s.
5. **Verify cleanup/PII hygiene:** confirm the signed URL 404s after the run (object
   deleted) and that the bucket is **private** (a bare object path without the token is
   forbidden).

### 4.5 Behavioral deltas & follow-ups (not blockers)

- **Verification-code live relay is dormant.** The in-run `request_verification_code`
  tool lived in the deleted engine, so `awaiting_code` is no longer *set* — code-gated
  ATSs now surface as `needs_attention` (blocker `verification_code`) telling the user
  to finish manually. The `/applications/{id}/verification-code` endpoint and the Redis
  `apply:code:{id}` mailbox remain but are currently unused; leave or remove in a later
  cleanup.
- **Hard-form control surface is gone by design.** Humanized typing, Lever
  autocomplete-commit, and byte-inject upload are Browserbase's problem now; we steer
  only via `SYSTEM_PROMPT` + `browserSettings.proxies`. Watch Ashby/Lever/Five9
  win-rates in the tracker and tighten the system prompt (then re-sync the agent) if a
  portal regresses.
- **Result trust** now rests on the model returning honest `submitted`/`blocker`
  values against `RESULT_SCHEMA`; `unconfirmed` is deliberately routed to
  `needs_attention` (never auto-resubmitted) to avoid duplicate applications.
