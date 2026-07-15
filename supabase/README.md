# Database schema (Supabase is source of truth)

Scout’s Postgres schema is **not** versioned in this repo. All DDL lives on the hosted Supabase project and in its migration / SQL history.

## Project

| | |
|---|---|
| **Name** | `scout-dev` |
| **Project ref** | `vyrtlehuexjllrdnehmc` |
| **Dashboard** | https://supabase.com/dashboard/project/vyrtlehuexjllrdnehmc |

## How to change schema

1. **Preferred:** Supabase Dashboard → **SQL Editor**, or Cursor **Supabase MCP** (`apply_migration` / `execute_sql`).
2. **Do not** add `supabase/migrations/*.sql` files here — they drift from production and were removed on purpose.
3. After changes, use MCP `list_migrations` and `get_advisors` to verify.

## Current `public` tables (live)

`users`, `resumes`, `analyses`, `jobs`, `applications`, `conversations`, `scout_runs`, `resume_variants`, `notifications` — all with RLS enabled.

Apply `notifications.sql` in the SQL Editor to create the `notifications` table and backfill from existing applications.

Apply `perf_lint_fixes.sql` in the SQL Editor to clear the performance advisors (2026-07-15): rewrites all `public` RLS policies to use `(select auth.<fn>())` initplans and adds covering indexes for the flagged foreign keys. Idempotent.

Apply `security_lint_fixes.sql` in the SQL Editor to clear the security advisors (2026-07-15): pins `search_path` on the `applications_set_updated_at` trigger function and adds an explicit deny-all policy to the server-only `email_sends` table. Idempotent.

## Mascot tutorial state (2026-07-15)

Applied via MCP migration `add_mascot_tutorial_state_and_profile_complete_fn` (+ `fix_is_profile_complete_search_path`):

- `users.has_seen_intro_tour` (bool, default false) — first-run tour completion/skip
- `users.profile_nudge_dismissed_at` / `users.last_profile_nudge_shown_at` (timestamptz) — incomplete-profile nudge cadence
- `public.is_profile_complete(users)` + `BEFORE INSERT/UPDATE` trigger — authoritative `profile_complete` derivation matching `packages/web/lib/profile-completion.ts` (12 of 14 required fields)
- Existing rows were backfilled with `has_seen_intro_tour = true` so the tour does not replay for established users

Follow-up MCP migration `add_seen_page_intros_and_claim_rpc`:

- `users.seen_page_intros` (jsonb object, default `{}`) — scalable one-time page intro keys (`explore`, `tracker`, `first_scout_run`, …)
- `public.claim_page_intro(clerk_id, intro_key)` — atomic claim RPC (`service_role` only); returns true only on first claim
- Users with existing `applications` were backfilled with `first_scout_run: true` so the first-run acknowledgement does not false-fire

## MCP for agents

Connect Supabase MCP (scoped to `project_ref=vyrtlehuexjllrdnehmc`). Tools: `list_tables`, `list_migrations`, `execute_sql`, `get_advisors`.

Historical schema was applied via the SQL Editor before CLI migrations were tracked; new DDL should use **Migrations** in the dashboard or `apply_migration` so `list_migrations` stays accurate.
