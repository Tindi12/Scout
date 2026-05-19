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

`users`, `resumes`, `analyses`, `jobs`, `applications`, `conversations`, `scout_runs`, `resume_variants` — all with RLS enabled.

## MCP for agents

Connect Supabase MCP (scoped to `project_ref=vyrtlehuexjllrdnehmc`). Tools: `list_tables`, `list_migrations`, `execute_sql`, `get_advisors`.

Historical schema was applied via the SQL Editor before CLI migrations were tracked; new DDL should use **Migrations** in the dashboard or `apply_migration` so `list_migrations` stays accurate.
