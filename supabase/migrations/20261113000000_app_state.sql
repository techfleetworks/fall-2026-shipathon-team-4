-- Appointment Ready: app data on the server, and Theo as the public demo account (ADR-010).
-- Run once in Supabase → SQL Editor after the earlier migrations (docs/SUPABASE_SETUP.md, step 9).
--
-- public.app_state: one record per user holding the app's data (profile, visits, timeline, medications,
-- stories…) in the same shape the screens use. Today it holds ONE record: Theo, the synthetic demo patient.
-- Real users' records come with the Visit store card (sync), which will add write policies then.
--
-- Safety:
--   Row-Level Security: a signed-in user can READ only their own record. There are NO insert/update policies:
--   only the server key writes, so nobody can mark their own record as the public demo.
--   is_public_demo: at most ONE record can be the public demo (unique index). GET /api/demo returns only that
--   record, only its safe fields, through the server.
--   ON DELETE CASCADE: deleting a user deletes their record.

create table if not exists public.app_state (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  data            jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 524288),
  -- The day the data was written. The demo shifts its dates by (today - anchor_date) so "in 20 days" stays true.
  anchor_date     date not null default current_date,
  is_public_demo  boolean not null default false,
  updated_at      timestamptz not null default now()
);

create unique index if not exists app_state_one_public_demo on public.app_state (is_public_demo) where is_public_demo;

alter table public.app_state enable row level security;

drop policy if exists "Users can read their own app data" on public.app_state;
create policy "Users can read their own app data"
  on public.app_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists app_state_touch_updated_at on public.app_state;
create trigger app_state_touch_updated_at
  before update on public.app_state
  for each row execute function public.touch_updated_at();
