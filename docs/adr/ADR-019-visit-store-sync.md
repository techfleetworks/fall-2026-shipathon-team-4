---
status: proposed
date: 2026-11-15
deciders: Team 4 backend (author); Yadira chose opt-in sync (2026-11-15); wording and placement: Diana (frontend) and Dominic
  (Product); the storage/offline notice was requested by the mentor (facts in docs/STORAGE_NOTICE.md)
---

# ADR-019: Visit store, the compounding record (opt-in backup and sync)

## Context

Board card: "Simple visit store (the compounding record)", which depends on secure storage (ADR-018, now built) and features a shareable
record (next PR). The record should build up visit after visit and survive a new phone or a cleared browser. The app is offline-first
(local storage) and many screens promise "stays on this device". Yadira chose **opt-in**: a switch, off by default.

Forces: devices are often offline; a person may use a phone and a laptop; two people may share one device; a deletion must not
come back; the demo account (Theo) is read-only; no paid services.

## Decision

- **Opt-in switch** "Back up and sync" in Settings → Privacy and data (`src/components/BackupSync.tsx`, one line in Diana's
  `PrivacySection`). Off by default; only on the real users' site with server sign-in; never in demo mode. Turning off asks whether to
  keep or delete the server copy (`DELETE /api/me/record`).
- **The device copy stays the source the screens use.** The server copy (encrypted, ADR-018) is the backup and carries changes between devices.
- **Three-way merge** (`src/lib/sync/merge.ts`) against `base`, the record at this device's last successful sync, entry by entry (by id):
  new entries from both sides are kept; a delete sticks unless the other side edited that entry since (an edit beats a delete); an entry
  edited on both sides → this device wins; single fields (profile, settings) follow the same rule. No base (first sync on a device) → union.
- **Sync engine** (`src/lib/sync/engine.ts`): pull (on start, coming online, returning to the app) or assume the server still has `base`
  (after a local change, ~2 s debounce); merge; apply to the device; `PUT` with the version it was based on; on `409` merge with the
  newer copy and retry (3 tries). Syncs never overlap. Offline / signed out / server not set up → the device copy is untouched and the
  status says why. Sync remembers which account turned it on: if another account signs in on this device, it pauses (`other-account`),
  so two people's records are never mixed.
- **New device**: after logging in on a device with no account data, if the account has a backup it is restored and sync is turned on
  (the person opted in on another device), instead of starting onboarding again (`restoreBackupAfterLogin`, called from `Auth.tsx`).
- **Never synced**: the local password hash, the email, share links, `signedIn`, `demoMode` (also enforced by the server's allow-list).
- **Delete everything / delete account** also clears the sync settings, so nothing is pulled back.

Pattern choice (pattern-selector): **three-way merge with a stored base** (the approach version control uses) instead of last-writer-wins
(loses a device's work) or CRDTs (heavy, needs every edit as an operation, a large change to the store). **Dependency injection**
for the engine (account, storage, server passed in) so it runs in tests with the real encrypted service. **Optimistic concurrency**
(ADR-018 versions) instead of locks, which offline devices can't hold.

## Consequences

- Good: the record compounds across visits and devices; nothing added is lost; deletes stick; works offline; free.
- Limit: the same entry edited on two devices between syncs keeps this device's edit (the other edit is lost). Rare for this app.
- Limit: `base` is a second copy of the record in this device's storage (same protection as the record itself).
- Limit: whole-record saves (up to 512 KB, ADR-018). Fine for years of visits; revisit with per-entry rows if records grow.
- Limit: on-screen "stays on this device" wording is true only while backup is off; Product to adjust (docs/STORAGE_NOTICE.md).
- Needs ADR-018's setup (migration in both projects, `RECORD_ENCRYPTION_KEY`); until then the switch reports "Backup isn't available yet".

## Verification

`src/lib/sync/merge.test.ts` (13: synced fields only, key-order-proof comparison, first sync union, adds on both sides, deletes stick
both ways, edit beats delete, server edit wins, both edited → this device, single fields, new device takes the backup profile, merge
is stable). `src/lib/sync/engine.test.ts` (16, against the real encrypted record service: opt-in only, no password hash sent, sign-in
needed, two devices compound, delete not undone, stale device merges on 409, nothing sent when nothing changed, offline then catch-up,
server not set up, signed out, other account on the device, turn off keep/delete, nothing sent after turning off, new-device restore,
no backup, no overlapping syncs). `features/visit-store.feature` (6 scenarios).
Mutation-checked: deleted entries coming back (2 tests failed), another account syncing (1), syncing without opting in (1), sending the
password hash (2).
