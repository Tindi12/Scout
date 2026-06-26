# Scout Job-Application Concurrency — Diagnostic Report

> Investigation only — no code was changed. Date: 2026-06-25.
> Scope: why a 16-job batch collapsed on a ~3-worker dev setup, and how it would
> behave under a proper production worker fleet.

## TL;DR verdict

The 16-job collapse was **~90% a dev-setup artifact and ~10% a real architectural
gap**. The dominant cause was **queue serialization**: you had ~3 single-task worker processes, so only 3 of 16 applications ran at a time and the other 13 sat in Redis for the full multi-minute duration of the jobs ahead of them. Compounding it, on Windows `--pool=solo` **Celery's time limits don't work**, so any wedged attempt held
its worker for the in-code 14.5-minute cap (× up to 3 attempts with 3-minute retry
backoffs) instead of being killed. Both of those disappear with a proper multi-worker
prefork deployment.

The **real bug that will follow you to production** is the opposite of what bit you
here: `/jobs/scout/run` fans out **every** job at once with **no concurrency cap, no
rate limit, and no per-user fairness** (confirmed — there is no semaphore/`rate_limit`/
`task_routes`/queue anywhere in `packages/api`). In dev the 3-slot queue accidentally
throttled you. Production removes that accidental governor and lets a batch slam
Browserbase's 25-session ceiling and OpenAI's rate limits head-on.

Browserbase session ceiling was correctly ruled out — 16 < 25, and it was never the
bottleneck.

---

## 1. Worker model / parallelism

**Config** (`core/celery_app.py:20-35`):

- `worker_concurrency=3`, `worker_prefetch_multiplier=1`, `task_acks_late=True`.
- App-level `task_soft_time_limit=300` / `task_time_limit=360`. ⚠️ **These are dead
config** — the task decorator overrides them (see §3).
- The comment `worker_concurrency=3, #for dev but switch to 3 for production` is a
no-op note (same number) — a config smell.

**Actual launch** (`scripts/dev-workers.mjs:49-63`, and the `--pool=solo` command in
CLAUDE.md):

```
uv run celery -A core.celery_app worker --pool=solo -n workerN@%h -l info
```

- `dev-workers.mjs` spawns `CELERY_WORKER_COUNT` (**default 3**) **separate solo-pool
processes**.
- The script's own header says it plainly: *"worker_concurrency in celery_app.py does
not parallelize solo workers — each process runs one apply task at a time."*
`--pool=solo` **ignores `worker_concurrency=3` entirely.**

**Real parallel limit on your machine:** = number of solo worker processes.

- `pnpm dev:workers` → **3 concurrent applies max.**
- The single `celery ... --pool=solo` command in CLAUDE.md → **1 at a time.**
- You said "~3 workers," so: **3 slots.**

**What happened to jobs 4–16:** `/jobs/scout/run` enqueued all 16 instantly
(`routes/jobs.py:250-256`, a plain `for` loop of `apply_to_job_task.delay(...)`). With
3 solo workers + `prefetch_multiplier=1` + `acks_late`, each worker pulls **one** task,
runs it to completion, then pulls the next. So jobs 1–3 run; **jobs 4–16 sit in the
Redis queue** and are picked up in ~6 waves. Each wave can take many minutes (see §3),
so the tail jobs accrue 20+ minutes of pure queue wait before they even start.

**solo vs prefork:**

- **solo (your Windows dev):** one task per process; no signal-based `soft_time_limit`,
no pool `kill_job` for `time_limit`. The code comments at `job_tasks.py:264-273`
document this exactly — Celery's enforcement is *"dead on the Windows dev worker"* and
a hung pipeline *"only died via cold-shutdown."* The only working backstop is the
in-code `asyncio.wait_for(..., 870)`.
- **prefork (Linux prod):** N forked child processes = N truly concurrent tasks, **and**
SIGTERM/SIGKILL time-limit enforcement actually works, so a wedged task dies at
900/960s instead of hanging.

---

## 2. Resource contention / shared state

I traced session and agent acquisition. **Per-task isolation is good; there is no
harmful cross-task shared state in the pools you actually run.**

- **Browserbase session:** created fresh per `apply()` call in `_new_browser_session`
(`browser_agent.py:1630-1641`) → `core/browserbase.create_session`
(`browserbase.py:74-123`). Each task gets its **own** session, **own** `Browser`,
**own** tmp dir (`apply()` at `browser_agent.py:1672`), released in a `finally`
(`:1781-1783`). No session sharing.
- **browser-use Agent:** built per phase (`_run_phase`, `browser_agent.py:1465-1479`) —
own `Tools` registry per call too. Not shared.
- **Module-level singletons:**
  - `browser_agent = BrowserUseAgent()` (`browser_agent.py:1786`) holds shared
  `self.llm` / `self.fallback_llm` (`__init__`, `:1287-1289`).
  - `get_client()` Browserbase client (`browserbase.py:63-71`) is a process-wide
  singleton.
  - **Why these don't bite under solo/prefork:** both pools are **process-based**. Each
  worker process imports the module separately and gets its own copies, and solo runs
  one task at a time within a process. So the singletons are never exercised by two
  concurrent tasks in the same interpreter. **Latent risk, not active bug.**

⚠️ **The one trap to flag:** the shared `self.llm` singleton becomes a genuine
concurrency bug **only if you ever switch to a thread/gevent/eventlet pool**
(`--pool=threads`/`gevent`), where multiple coroutines in one process would share one
`ChatOpenAI`. Don't do that without making the LLM per-task. Under prefork it's safe.

**Per-task synchronous work that *does* contend** (this is the real local contention,
not browser RAM — the browsers are remote on Browserbase): each apply task, before/
around the browser run, does CPU/blocking work *inside the worker process*:

- `asyncio.run(resume_rewriter.jd_specific_rewrite(...))` — an LLM call
(`job_tasks.py:106`).
- `asyncio.run(cover_letter_writer.generate(...))` — another LLM call
(`job_tasks.py:195`).
- `generate_resume_pdf` / `generate_cover_letter_pdf` → `**pdflatex`**, CPU-bound,
blocking the solo process (`job_tasks.py:337,366`).
- Multiple synchronous Supabase round-trips.

3 of these in parallel, plus Next.js dev + uvicorn + Redis on one laptop, is heavy —
but it's the *prep* work and pdflatex competing for CPU, not 16 Chrome instances.

---

## 3. The actual failure mechanism (ranked)

**The budget ladder** (so the numbers below are grounded), from `job_tasks.py:261-273`

- `browser_agent.py:124-126` + `browserbase.py:53`:
`agent run 840s < apply pipeline 870s < Celery soft 900s < hard 960s < Browserbase session 1260s`.
Plus retries: `max_retries=2`, `SESSION_LOSS_BACKOFF_SECONDS=180`
(`job_tasks.py:263,445-452`).

So **one** application can occupy a worker for **~14.5 min per attempt**, and a
session-loss path retries up to twice with 3-min backoffs → **~30–45 min of worker
occupancy for a single failing job.**

Ranked causes of "20-min times, ~zero successes" on the dev setup:

1. **Queue serialization — 3 slots for 16 tasks (PRIMARY).** Explains the 20-minute
  wall-clock times directly: tail jobs wait through multiple full-length attempts
   ahead of them. Evidence: `routes/jobs.py:250-256` (fan-out), solo pool (§1).
2. **Maximal worker occupancy per task + retries (why slowness became total failure).**
  Queueing alone explains slowness, not zero successes. The kicker is that each
   occupied slot tends to run for the *full* 14.5-min cap when an agent stalls, then
   retries. With 3 slots all stuck in long attempts, the queue barely drains within the
   window you watched, so almost nothing reaches a confirmed `applied`. Evidence:
   `_AGENT_RUN_TIMEOUT=840` / `APPLY_PIPELINE_TIMEOUT=870`, retry logic
   `job_tasks.py:445-459`.
3. **solo pool can't enforce time limits (amplifier).** On Windows, a task wedged
  *below* the asyncio layer (a hung synchronous CDP/REST call, a blocking
   `browser.kill()`) can't be SIGKILLed by Celery — documented at `job_tasks.py:264-273`
   (*"ran 12 min"*) and `browser_agent.py:1643-1659` (`browser.kill()` *"hung the worker
   for ~7 minutes once"*). Only the in-code `asyncio.wait_for` saves it; anything
   outside that guard pins a precious slot even longer.
4. **Single-machine CPU contention (minor amplifier).** 3× (`pdflatex` + 2 LLM prep
  calls + CDP event loops) on one laptop slows each attempt, lengthening occupancy.
   Real but secondary.
5. **LLM rate limiting (NOT the dev cause; real in prod).** The browser agent uses
  **OpenAI `gpt-5.4-mini*`* directly (`services/browser_llm.py:17`), *not* the
   Gemini/Groq router. At dev's ≤3 concurrent agents you have only a few in-flight
   OpenAI requests — unlikely to trip tier limits. At true 16×–100× prod concurrency,
   OpenAI RPM/TPM becomes a live constraint.

**Browserbase session ceiling: ruled out, correctly.** 16 < 25, and
`browserbase.py:7-12` notes the project is healthy with sessions ending COMPLETED.

---

## 4. Dev artifact vs. real production bug (the key distinction)

### Dev artifacts — these largely vanish with proper prod workers

- **The 3-slot ceiling.** Prefork across real worker dynos lets a 16-batch run far
closer to concurrently (up to the 25-session ceiling), collapsing the queue wait that
produced the 20-minute times.
- **Broken time-limit enforcement.** Linux prefork restores SIGTERM/SIGKILL, so wedged
attempts die at 900/960s instead of hanging a slot — kills cause #3.
- **Single-laptop CPU/pdflatex contention.** Separate worker processes on adequate
hardware remove this.

→ **The specific "16 broke my machine" event was mostly a dev artifact.** With a real
fleet, those 16 would have mostly run in parallel.

### Real architectural bugs — these persist and will bite *harder* in prod

- **Unbounded fan-out, zero governor.** Confirmed: no semaphore, no `rate_limit`, no
`task_routes`, no dedicated queue anywhere in `packages/api`. `/jobs/scout/run`
enqueues *all* job_ids at once (`routes/jobs.py:250-256`). In dev the 3-slot queue
accidentally rate-limited you; **prod removes that accident.** Then:
  - A 50-job batch (or two users × 16) blows past **Browserbase's 25-session limit** →
  session-create failures, the exact failure you thought you'd ruled out — just
  relocated to prod.
  - Concurrent agents hammer **OpenAI rate limits** with no backpressure.
- **No per-user fairness / single default queue.** One user's 100-job batch monopolizes
the whole fleet; everyone else starves behind it. There's only the default queue.
- **Very high worker-hours per application.** Up to ~14.5 min/attempt × up to 3
attempts, each holding a full slot. Throughput is fundamentally worker-bound; without
bounded concurrency you must massively over-provision workers, and they'll still
collide with the 25-session cap.
- **Latent shared-LLM-singleton hazard** if you ever move off process-based pools (§2).

---

## 5. Recommended throughput design (options — not implemented)

Goal: stay safely under **25 concurrent browsers**, be fair across users, and not melt
OpenAI limits — while batches of 16/50/100 drain steadily.

**A. Bounded global concurrency (the core fix).** Cap concurrent apply tasks at
~**18–20** (headroom under 25). Options, simplest first:

- Size the fleet so total prefork concurrency ≤ 20 (e.g. dedicated apply queue + worker
count tuned to it).
- A **Redis-backed distributed semaphore** acquired at task start / released in
`finally` — enforces the cap regardless of worker count.
- Celery `task_annotations` `**rate_limit*`* on `tasks.apply_to_job` as a coarse
throttle.

**B. Per-user concurrency cap.** Limit each user to ~3–5 in-flight applies (Redis
counter, or dispatch the batch as a chunked `group`/`chord` instead of a raw loop) so
one batch can't starve others.

**C. Throttle spawning, don't dump.** Replace the all-at-once loop with wave dispatch
(`celery.chunks`, or self-rescheduling tasks) so the queue depth stays bounded.

**D. Queue prioritization.** Separate queues by tier (Scout+ priority over Pro/Free)
and/or round-robin per user, so priority and fairness are explicit rather than
FIFO-by-arrival.

**E. Split prep from browsing.** Move resume rewrite + cover letter + `pdflatex`
(`job_tasks.py:106,195,337`) into a short separate task, leaving the long task to *only*
browse. Improves worker utilization and makes the browser-concurrency cap precise (1
long task ≈ 1 Browserbase session).

**F. API backpressure.** At `/jobs/scout/run`, reject or soft-queue with a warning when
a user exceeds an in-flight limit, instead of silently enqueueing 100.

**Minimum viable combo:** **A + B** fixes the production cliff. **C/D/E/F** are scaling
polish.

---

## Appendix — two correctness notes spotted while tracing (flagging only)

- `core/celery_app.py:31-32` `task_soft_time_limit=300/360` is **dead config** —
overridden by the decorator's `900/960` in `job_tasks.py:261`. Misleading; worth
reconciling.
- `core/celery_app.py:30` comment "for dev but switch to 3 for production" reads as a
leftover (same value).

## Files inspected

- `packages/api/core/celery_app.py` — Celery app config
- `packages/api/scripts/../../scripts/dev-workers.mjs` — worker launch (solo pool ×N)
- `packages/api/tasks/job_tasks.py` — `apply_to_job_task`, budget ladder, retries
- `packages/api/services/browser_agent.py` — session + agent acquisition, `apply()`
- `packages/api/core/browserbase.py` — session creation / config
- `packages/api/services/browser_llm.py` — OpenAI `gpt-5.4-mini` agent LLM
- `packages/api/routes/jobs.py` — `/jobs/scout/run` enqueue loop

