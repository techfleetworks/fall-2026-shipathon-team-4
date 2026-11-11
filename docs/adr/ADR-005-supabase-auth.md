---
status: proposed
date: 2026-11-11
deciders: Team 4 backend (author); review by Diana (frontend)
---

# ADR-005: Sign-up and log-in on Supabase Auth, checked by the Express API

## Context

The hi-fi screens have sign-up and log-in, but accounts were stored only in the browser (a salted PBKDF2 hash in
`localStorage`): no other device can log in, clearing the browser deletes the account, and the API can't tell who
is calling. ADR-001 Decision 2 chose **Supabase** (Postgres + Auth) and its Security Notes require that
"Express checks the Supabase JWT on every request". The Copy Drafts promise "deleted whenever you ask", and the
dev note there says that once we persist anything we must ship a working delete.

## Decision

- **Supabase Auth is the sign-up / log-in server.** The browser calls it through `src/lib/auth.ts`
  (`signUp`, `logIn`, `logOut`, `deleteServerAccount`); Diana's screens call those functions, so their design is unchanged.
  Supabase stores the email and a password hash; our code never stores passwords.
- **The Express API checks the token** (`server/auth.ts` → `requireUser`) on `/api/transcripts`,
  `/api/prep-summary` and `/api/visit-summary` by asking Supabase who the token belongs to. `/api/health` stays public.
  `src/lib/api.ts` attaches `Authorization: Bearer <token>` automatically; 401 → "Please log in again."
- **Delete for real:** `DELETE /api/account` (signed-in user only) deletes the user with the service-role key;
  their `profiles` row goes with it (`ON DELETE CASCADE`). Settings → Delete account calls it first and wipes the
  device only if it succeeded, so a failed delete can be retried.
- **Database:** `supabase/migrations/20261111000000_profiles.sql` creates `profiles` (first/last name) with
  **Row-Level Security** (each user can read and update only their own row), a trigger that creates the row at
  sign-up, and no insert/delete policies.
- **Switch-on by configuration:** with no Supabase settings the API stays open and the screens keep the on-device
  sign-in, so local dev, CI and the demo work before setup. In production set `REQUIRE_AUTH=true` so a
  missing setting fails closed (503) instead of leaving the API open.

## Options considered

1. **Supabase Auth** (chosen): matches ADR-001; managed hashing, sessions, email confirmation and resets; same
   project gives Postgres + RLS for saving data next; free tier.
2. **Our own Express auth** (password hashing, sessions, resets, lockout, a database): more code that's easy to get
   wrong, and it would change ADR-001.

## Consequences

- Good: accounts work across devices; the API knows who is calling, which unlocks per-user data, rate limits and
  the Claude endpoints; deletion is real.
- Bad: each protected API call makes one extra request to Supabase to verify the token (fine at demo scale; can
  switch to local JWT verification with Supabase's signing keys later).
- Bad: stories, visits and recaps are still on the device; moving approved records to Postgres (ADR-001 Decision 5)
  is the next step.
- Secrets: the service-role key exists only as a server environment variable; `.env*` files are git-ignored.

## Security decision record

| Threat | Response | Check |
|---|---|---|
| Calling the API without an account | Mitigate: token verified with Supabase on every protected route | `server/auth.test.ts` (401 cases) |
| Forged / malformed tokens, oversized headers | Mitigate: strict `Bearer` format, 4 KB cap, Supabase verification | `server/auth.test.ts` |
| Misconfigured production left open | Mitigate: `REQUIRE_AUTH=true` → 503 | `server/auth.test.ts` (fail closed) |
| Deleting someone else's account | Eliminate: delete uses the id from the verified token only; no id in the request | `server/auth.test.ts` (only that user) |
| Reading other users' data in the database | Eliminate: RLS policies `auth.uid() = id` | migration; verify in Supabase after setup |
| Account enumeration through sign-up errors | Mitigate: one generic message for "already registered" and other failures | `src/lib/auth.ts` |
| Service-role key leaking to the browser | Eliminate: never `VITE_`-prefixed; server env only; `.env*` ignored | `.env.example`, `.gitignore` |

Not verified yet: the live Supabase project (it doesn't exist until setup). Tests use a stand-in verifier.
