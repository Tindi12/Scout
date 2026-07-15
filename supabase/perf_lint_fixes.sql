-- ============================================================================
-- Scout — Supabase linter remediation (2026-07-15)
-- Apply in Dashboard → SQL Editor (project scout-dev), or via MCP
-- apply_migration. Idempotent — safe to re-run; re-running is a no-op.
--
-- Fixes two linter findings:
--
-- 1) auth_rls_initplan (WARN, 25 policies)
--    Policies written as e.g. `auth.uid()::text = clerk_id` make Postgres call
--    auth.uid() ONCE PER ROW it scans. Wrapping the call in a scalar subquery
--    `(select auth.uid())` lets the planner hoist it into an InitPlan: it is
--    evaluated once per statement and treated as a constant for the scan.
--    Same result rows, same security — strictly a query-plan improvement.
--
--    Rather than hand-rewriting 25 policies (and risking a typo silently
--    changing semantics), the DO block below reads every RLS policy in
--    `public` from pg_policies, rewrites bare auth.<fn>() / current_setting()
--    calls into subselects, and applies the SAME expression back with
--    ALTER POLICY. ALTER POLICY preserves the policy's command (SELECT/
--    INSERT/...), roles, and permissive/restrictive mode — only the
--    USING/WITH CHECK expressions change shape.
--
-- 2) unindexed_foreign_keys (INFO, 8 foreign keys)
--    Covering indexes added below. The two `analyses` indexes are composite
--    with created_at DESC because the hottest queries in the API are
--    "latest analysis for this user/resume" (routes/resume.py,
--    routes/jobs.py) — the leading column still covers the FK.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Rewrite RLS policies: auth.<fn>() → (select auth.<fn>())
-- ---------------------------------------------------------------------------

create function pg_temp.scout_wrap_auth(expr text) returns text
language plpgsql
as $$
declare
  result text := expr;
begin
  if result is null then
    return null;
  end if;

  -- Protect calls that are already wrapped (pretty-printed by Postgres as
  -- "( SELECT auth.uid() AS uid)") so re-runs don't double-wrap them.
  result := regexp_replace(result, '(SELECT\s+)auth\.', '\1__AUTH_OK__.', 'gi');
  result := regexp_replace(
    result, '(SELECT\s+)current_setting\(', '\1__CS_OK__(', 'gi'
  );

  -- Wrap the bare per-row calls the linter flags.
  result := regexp_replace(
    result, 'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'gi'
  );
  result := regexp_replace(
    result, 'current_setting\(([^()]*)\)', '(select current_setting(\1))', 'gi'
  );

  -- Restore the protected, already-wrapped calls.
  result := replace(result, '__AUTH_OK__.', 'auth.');
  result := replace(result, '__CS_OK__(', 'current_setting(');
  return result;
end;
$$;

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  cmd text;
  rewritten int := 0;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    new_qual := pg_temp.scout_wrap_auth(pol.qual);
    new_check := pg_temp.scout_wrap_auth(pol.with_check);

    if new_qual is distinct from pol.qual
       or new_check is distinct from pol.with_check then
      cmd := format(
        'alter policy %I on %I.%I',
        pol.policyname, pol.schemaname, pol.tablename
      );
      if new_qual is not null then
        cmd := cmd || format(' using (%s)', new_qual);
      end if;
      if new_check is not null then
        cmd := cmd || format(' with check (%s)', new_check);
      end if;

      execute cmd;
      rewritten := rewritten + 1;
      raise notice 'rewrote policy % on %.%',
        pol.policyname, pol.schemaname, pol.tablename;
    end if;
  end loop;

  raise notice 'auth_rls_initplan: % policies rewritten', rewritten;
end;
$$;

drop function pg_temp.scout_wrap_auth(text);

-- ---------------------------------------------------------------------------
-- 2) Covering indexes for the flagged foreign keys
-- ---------------------------------------------------------------------------

-- analyses: "latest analysis" lookups always order by created_at desc.
create index if not exists idx_analyses_user_id_created_at
  on public.analyses (user_id, created_at desc);
create index if not exists idx_analyses_resume_id_created_at
  on public.analyses (resume_id, created_at desc);

create index if not exists idx_applications_job_id
  on public.applications (job_id);

create index if not exists idx_cover_letter_variants_resume_id
  on public.cover_letter_variants (resume_id);
create index if not exists idx_cover_letter_variants_job_id
  on public.cover_letter_variants (job_id);

create index if not exists idx_resume_variants_resume_id
  on public.resume_variants (resume_id);
create index if not exists idx_resume_variants_job_id
  on public.resume_variants (job_id);

create index if not exists idx_resumes_user_id
  on public.resumes (user_id);

-- ---------------------------------------------------------------------------
-- Verification (optional): both queries should return 0 rows afterwards.
-- ---------------------------------------------------------------------------
-- Policies still calling auth fns per-row (unwrapped):
--   select tablename, policyname from pg_policies
--   where schemaname = 'public' and (
--     regexp_replace(coalesce(qual, '') || coalesce(with_check, ''),
--                    'SELECT\s+auth\.', 'OK', 'gi')
--     ~* 'auth\.(uid|jwt|role|email)\(\)'
--   );
-- Then re-run Dashboard → Advisors → Performance to confirm the warnings clear.
