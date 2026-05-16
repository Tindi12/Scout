-- Profile fields used by the Scout Profile page and the Scout Agent
-- when filling job applications on behalf of the user.
--
-- All new columns are nullable (or have safe defaults) so existing
-- rows remain valid without backfill. Server-side completion math
-- (lib/profile-completion.ts) drives the profile_complete rollup.

alter table public.users
  -- Personal / contact
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists portfolio_url text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists address_region text,
  add column if not exists postal_code text,
  add column if not exists country text default 'United States',

  -- Work authorization
  add column if not exists work_authorization text,
  add column if not exists cpt_eligible boolean not null default false,
  add column if not exists opt_eligible boolean not null default false,
  add column if not exists requires_sponsorship boolean,

  -- Education detail (school, gpa, grad_year already exist from onboarding)
  add column if not exists degree_type text,
  add column if not exists major text,
  add column if not exists minor text,

  -- Job preferences
  add column if not exists preferred_locations text[] not null default '{}'::text[],
  add column if not exists remote_preference text,
  add column if not exists willing_to_relocate boolean not null default false,
  add column if not exists earliest_start_date date,

  -- Application defaults
  add column if not exists heard_about_us text,
  add column if not exists default_cover_letter text,

  -- Diversity (all optional)
  add column if not exists gender_identity text,
  add column if not exists race_ethnicity text,
  add column if not exists veteran_status text,
  add column if not exists disability_status text,

  -- Rollup (computed by updateProfile server action)
  add column if not exists profile_complete boolean not null default false;
