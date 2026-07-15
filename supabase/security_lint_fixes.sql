-- ============================================================================
-- Scout — Supabase security linter remediation (2026-07-15)
-- Apply in Dashboard → SQL Editor (project scout-dev), or via MCP
-- apply_migration. Idempotent — safe to re-run.
--
-- 1) function_search_path_mutable (WARN):
--    public.applications_set_updated_at (the applications.updated_at trigger
--    behind the stale-application reaper) has no pinned search_path, so object
--    names inside it resolve using the CALLER's search_path at runtime. If an
--    attacker can create shadowing objects in a schema that resolves first,
--    they can hijack what the function executes. Pinning search_path makes
--    resolution deterministic. Empty is the strictest pin and is safe here:
--    the function only touches NEW and now(), and pg_catalog is always
--    searched implicitly.
--
-- 2) rls_enabled_no_policy (INFO):
--    public.email_sends is the transactional-email idempotency table, written
--    ONLY by the FastAPI backend through the service-role key — which
--    bypasses RLS entirely. "RLS on, zero policies" already denies all
--    anon/authenticated access, which is the intended posture; the linter
--    just can't tell intent from oversight. The explicit deny-all policy
--    below keeps identical behavior, documents the intent, and clears the
--    finding. Do NOT loosen it: OTP/email claim rows never belong in the
--    browser.
-- ============================================================================

-- 1) Pin the trigger function's search_path.
alter function public.applications_set_updated_at() set search_path = '';

-- 2) Explicit deny-all policy for the server-only email_sends table.
drop policy if exists "email_sends is service-role only" on public.email_sends;
create policy "email_sends is service-role only"
  on public.email_sends
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Verification (optional):
--   select proname, proconfig from pg_proc
--   where proname = 'applications_set_updated_at';   -- expect {search_path=""}
--   select policyname from pg_policies
--   where tablename = 'email_sends';                 -- expect the deny-all policy
-- Then re-run Dashboard → Advisors → Security to confirm both findings clear.
