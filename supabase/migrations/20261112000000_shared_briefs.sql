-- Appointment Ready: per-person doctor sharing (ADR-009).
-- Run once in Supabase → SQL Editor after the profiles migration (see docs/SUPABASE_SETUP.md, step 6).
--
-- What lives where:
--   public.care_team      the people a patient shares with (name, role, work email, clinic). One row per person.
--   public.shared_briefs  one expiring link per person: a frozen one-page brief + a SHA-256 HASH of the link token.
--                         The token itself is never stored, so a database leak can't be turned into working links.
-- Safety:
--   Row-Level Security: a signed-in user can read ONLY their own rows. Doctors never query the database: the API
--   looks a link up by its token hash with the server key and returns the brief only while it's active.
--   ON DELETE CASCADE: deleting the account deletes every person and every link: all sharing stops at once.
--   Stopping one person's link (revoked_at) never touches anyone else's.

create table if not exists public.care_team (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  role        text not null check (role in ('Primary care', 'Therapist', 'Psychiatrist', 'Specialist', 'Other')),
  email       text not null check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  clinic      text not null default '' check (char_length(clinic) <= 150),
  created_at  timestamptz not null default now(),
  unique (user_id, email)
);

create table if not exists public.shared_briefs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  recipient_id  uuid not null references public.care_team (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  brief         jsonb not null check (pg_column_size(brief) <= 65536),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '30 days 1 minute')
);

create index if not exists shared_briefs_user_idx on public.shared_briefs (user_id, created_at desc);

alter table public.care_team enable row level security;
alter table public.shared_briefs enable row level security;

-- Read own rows only. Writes go through the API (server key), which scopes every query to the signed-in user.
drop policy if exists "Users can read their own care team" on public.care_team;
create policy "Users can read their own care team"
  on public.care_team for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own shared briefs" on public.shared_briefs;
create policy "Users can read their own shared briefs"
  on public.shared_briefs for select
  to authenticated
  using ((select auth.uid()) = user_id);
