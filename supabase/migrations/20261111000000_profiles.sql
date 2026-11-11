-- Appointment Ready: user profiles (ADR-001 Decision 2; ADR-005).
-- Run once in Supabase → SQL Editor (see docs/SUPABASE_SETUP.md), or with the Supabase CLI: `supabase db push`.
--
-- What lives where:
--   auth.users (managed by Supabase Auth): email + a hash of the password. We never see the password.
--   public.profiles (this table): first and last name, one row per user.
-- Safety:
--   Row-Level Security: each user can read and update ONLY their own row.
--   ON DELETE CASCADE: deleting the account (DELETE /api/account) deletes the profile too: real hard delete.
--   No insert/delete policies: rows are created by the trigger below and removed only by the cascade.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '' check (char_length(first_name) <= 100),
  last_name   text not null default '' check (char_length(last_name) <= 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Keep updated_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row when someone signs up, from the names sent with sign-up (capped at 100 characters).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'first_name', 100), ''),
    coalesce(left(new.raw_user_meta_data ->> 'last_name', 100), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
