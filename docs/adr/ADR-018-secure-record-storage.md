---
status: proposed
date: 2026-11-15
deciders: Team 4 backend (author); Yadira chose app-level encryption, opt-in sync and snapshot sharing (2026-11-15);
  wording of anything people see: Diana (frontend) and Dominic (Product); the mentor asked for the offline/storage disclosure
---

# ADR-018: Secure storage for the person's record (encrypted on the server)

## Context

Board cards: "Secure storage" (Low) and "Simple visit store (the compounding record)", which **depends on secure storage** and features a
**shareable record**. Today a real user's record (stories, timeline, visits, medicines, next steps) lives only in their browser's
local storage, so a cleared browser or a new phone loses it. ADR-001 Decision 5 planned to move approved records to the database.

The record is health information about a mental-health condition. Forces:
- Supabase encrypts its disks, but anyone with database access (dashboard, a leaked server key, a backup) could read plain rows.
- The team won't pay for services (ADR-006). Supabase Vault / pgsodium would keep the key inside the same database.
- Many screens promise "stays on this device", so storing on the server must be the person's choice (opt-in, next PR).
- The demo account (Theo) is shared by every visitor and must stay read-only.

## Decision

The API server encrypts each record before it reaches the database. This PR adds the storage layer and its endpoints. The opt-in switch,
sync and the mentor's storage notice come in the Visit store PR, and the shareable record after that.

- **Encryption** (`server/records/crypto.ts`): AES-256-GCM (authenticated), a new random 96-bit IV per save, and the user's id as
  additional authenticated data, so a row copied onto another user fails to decrypt. The key is `RECORD_ENCRYPTION_KEY`
  (32 random bytes, base64), only in the server's settings, never in the database or the browser. `RECORD_ENCRYPTION_KEY_PREVIOUS`
  lets an old key decrypt during a key change; envelopes name their key by `kid` (a hash prefix, not the key).
- **Fails closed** (`recordServiceFromEnv`): without both a database and a valid key, record saving is off (503). It never stores plain records.
- **Table** `visit_records` (`supabase/migrations/20261115000000_visit_records.sql`, expand-only): `envelope` (ciphertext), `version`,
  timestamps. RLS on with no policies and browser roles revoked: only the server key can touch it. `ON DELETE CASCADE` with the account.
- **Versions** (compare-and-set): `PUT` saves only if the stored version is still `baseVersion`; otherwise `409` with the current record,
  so the next PR's sync merges instead of overwriting another device's changes.
- **Allow-listed content** (`server/records/record.ts`): the app's own record fields only, up to 512 KB. Never stored: the local password
  hash, the email, share links (they hold tokens), session flags.
- **Endpoints**: `GET`/`PUT`/`DELETE /api/me/record`, signed-in only, owner only, Theo read-only, bodies never logged. A row that fails
  to decrypt is a 500 (only the error type is logged), never altered data.

Pattern choice (pattern-selector): **Repository** (`RecordStore`, memory + Supabase, the same as the shares store) under a small
**service** that is the only place with the key (keeps encryption out of the routes and the store). **Optimistic concurrency** (version
compare-and-set) instead of locks: the app is offline-first, so devices can't hold a lock. Rejected: Supabase Vault/pgsodium (key lives
with the data it protects), encrypting in the browser (the key would have to live next to the data on the same device; may come later
for end-to-end encryption), one row per entry (more tables and migrations for no gain while records are small; revisit past ~512 KB).

## Consequences

- Good: a database leak, a backup or the dashboard alone shows only ciphertext. Free. Same pattern as the existing stores.
- Cost: **if the key is lost, records can't be recovered.** It must be backed up (setup step 10). Each Vercel project has its own key.
- Cost: the server can still read records while handling a request (needed for sync now and the shareable record later). This is not
  end-to-end encryption, and the privacy wording must not claim it is.
- Not changed here: existing `shared_briefs` snapshots and `app_state` (Theo, synthetic) are still stored as plain JSON. The shareable-record
  PR should store its snapshots through this same encryption, and older brief links can move over then (expand/contract).
- Operations: run the migration in both Supabase projects; add `RECORD_ENCRYPTION_KEY` to the real site's Vercel project. Until both are
  done the endpoints answer 503 and the app keeps everything on the device, so it is safe to deploy first.

## Verification

`server/records/crypto.test.ts` (round trip; no readable words in the envelope; new IV each time; owner binding; tamper → fail; wrong key;
key change; 5 bad-key cases fail closed; malformed envelopes). `server/records.test.ts` (save/load; stored row has no readable words; owner
only; version conflict keeps newer data; second first-save conflicts; delete; Theo read-only; 401; 503 when off; 10 bad inputs; 415/405;
copied row → 500 without data; env fails closed in 3 ways). `features/secure-storage.feature` (7 scenarios).
Mutation-checked: removing the owner binding (6 tests failed), the tamper check (5), the version check (2), dropping the password hash (1),
Theo's read-only check (1), and falling back to a built-in key when none is set (2) each failed tests.
Not yet checked against a real Supabase project (needs the migration and a key; covered by setup step 10's check).
