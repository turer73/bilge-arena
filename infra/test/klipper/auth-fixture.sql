-- Bilge Arena isolated auth fixture (TEST ONLY)
--
-- Scope: GoTrue auth.users -> public.profiles bootstrap, legal-consent
-- callback storage, tombstone guard, and deny-by-default RBAC tables.
-- This is deliberately NOT the full application migration chain and does
-- not create or mock the multiplayer/room RPCs.
-- Apply as postgres to the isolated test database only.

do $$ begin
  if current_database() <> 'academy_auth_test' then
    raise exception 'Fixture restricted to academy_auth_test';
  end if;
end $$;

create extension if not exists pgcrypto;

create schema if not exists auth;

-- GoTrue normally provides these helpers. The fixture owns them when a
-- minimal GoTrue/Postgres stack has not installed Supabase's SQL helpers.
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  )
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  )
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username varchar(32) not null unique,
  display_name text,
  avatar_url text,
  city text,
  grade integer,
  exam_type text,
  role text not null default 'user' check (role in ('user', 'admin')),
  total_xp integer not null default 0,
  level integer not null default 1,
  level_name text not null default 'Acemi',
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_played_at timestamptz,
  total_questions integer not null default 0,
  correct_answers integer not null default 0,
  total_sessions integer not null default 0,
  coin_balance integer not null default 0,
  owned_frames text[] not null default '{}',
  owned_backgrounds text[] not null default '{}',
  owned_nameplates text[] not null default '{}',
  selected_nameplate text not null default 'default',
  owned_cosmetic_badges text[] not null default '{}',
  owned_avatar_decorations text[] not null default '{}',
  selected_avatar_decorations text[] not null default '{}',
  is_premium boolean not null default false,
  premium_until timestamptz,
  preferred_theme text not null default 'dark',
  notifications boolean not null default true,
  is_discoverable boolean not null default false,
  profile_visibility text not null default 'private',
  leaderboard_opt_in boolean not null default false,
  referral_code text unique,
  referred_by uuid references public.profiles(id) on delete set null,
  onboarding_completed boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_base text;
  v_username text;
begin
  v_base := left(lower(coalesce(split_part(new.email, '@', 1), 'user')), 24);
  v_username := left(v_base || '_' || substr(replace(new.id::text, '-', ''), 1, 4), 32);
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', v_username),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('cookie', 'terms', 'kvkk')),
  consent_value jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_test_consent_legal_intent_type
  on public.consent_logs ((consent_value->>'intentId'), consent_type)
  where consent_type in ('terms', 'kvkk')
    and consent_value ? 'intentId';

-- Keep the role lookup surface real but empty/deny-by-default in this fixture.
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  unique (role_id, permission)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

alter table public.profiles enable row level security;
alter table public.consent_logs enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists test_profiles_select_own on public.profiles;
create policy test_profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists test_profiles_update_safe on public.profiles;
create policy test_profiles_update_safe on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists test_consent_select_own on public.consent_logs;
create policy test_consent_select_own on public.consent_logs
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.consent_logs,
  public.roles, public.role_permissions, public.user_roles from anon;
grant select on public.profiles to authenticated;
grant update (username, display_name, city, grade, exam_type,
  onboarding_completed, preferred_theme, is_discoverable,
  profile_visibility, leaderboard_opt_in) on public.profiles to authenticated;
grant select on public.consent_logs to authenticated;

-- The Next server routes use SUPABASE_SERVICE_KEY and must be able to read
-- profiles/consent/RBAC, while service_role remains server-only.
grant select, insert, update, delete on public.profiles,
  public.consent_logs, public.roles, public.role_permissions,
  public.user_roles to service_role;

-- Guard against accidental privileged fixture use by ordinary authenticated
-- callers; no admin/XP/RBAC write grant is given here.
revoke insert, delete on public.profiles from authenticated;
revoke insert, update, delete on public.consent_logs from authenticated;
revoke all on public.roles, public.role_permissions, public.user_roles from authenticated;
