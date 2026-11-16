-- Appointment Ready: the Visit store's encrypted records (ADR-018, secure storage).
-- Run once in Supabase → SQL Editor in BOTH projects (real and DEMO), after the earlier migrations
-- (docs/SUPABASE_SETUP.md, step 10). Adds a new table only (expand step): nothing existing changes.
--
-- public.visit_records: one row per user. `envelope` holds the person's record ENCRYPTED by the API server
-- (AES-256-GCM, key only in the server's settings), so the database alone can't read it. `version` goes up by one
-- on every save, so two devices can't silently overwrite each other (the API checks it).
--
-- Safety:
--   Row-Level Security is ON with NO policies, and browser roles are revoked: the browser keys (anon / signed-in)
--   can't read or write this table at all. Only the server key (behind /api/me/record) can.
--   ON DELETE CASCADE: deleting a user deletes their record.
--   Size limit: 1 MB per record (the API's own limit is lower).

create table if not exists public.visit_records (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  envelope    jsonb not null check (jsonb_typeof(envelope) = 'object' and pg_column_size(envelope) <= 1048576),
  version     integer not null default 1 check (version >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.visit_records enable row level security;
revoke all on table public.visit_records from anon, authenticated;

drop trigger if exists visit_records_touch_updated_at on public.visit_records;
create trigger visit_records_touch_updated_at
  before update on public.visit_records
  for each row execute function public.touch_updated_at();
