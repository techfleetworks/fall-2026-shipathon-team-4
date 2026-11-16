---
status: proposed
date: 2026-11-15
deciders: Team 4 backend (author); Yadira chose snapshot sharing (2026-11-15); wording and placement: Diana (frontend) and Dominic (Product)
---

# ADR-020: The shareable record (case history in a doctor link, as an encrypted snapshot)

## Context

The Visit store card "features a shareable record". Doctor links already exist (ADR-009): one expiring, stoppable link per person,
carrying a one-page brief. The case view (ADR-017) builds the clinically legible case, and the record now compounds across visits
(ADR-019). Shared briefs were stored as plain JSON (ADR-018 noted this). Yadira chose **snapshots**: the doctor sees what the patient
shared, as it was when the link was made.

## Decision

- **Opt-in, per link:** a new "Include: Case history (patterns, key dates, past visits)" box in the Share step, **off by default**
  (`src/screens/visit/Before.tsx`, Diana's screen; one checkbox).
- **What is frozen** (`src/lib/caseView/snapshot.ts → buildCaseSnapshot`, into `BriefSnapshot.case`): the case view's clinical lines
  only (presenting symptoms, course, medications, patterns, still-open items, key dates) and past visits (date, clinician, felt heard).
  No entry ids, no plain "you" lines. Not enough history → no case section (the brief is shared without it).
- **Server checks** (`server/shares/brief.ts`): the case section uses the same trim-and-cap rules as the brief (`CASE_PAGE` caps, then
  "…"), malformed parts are rejected, an empty section is dropped, and **crisis language anywhere** means nothing is shared.
- **Doctor view:** a "Case history" section under the brief when the snapshot has one (`src/components/SharedCase.tsx`, one line in
  Diana's `DoctorBriefBody`), with "Patient-reported… Patterns show timing, not cause."
- **Encrypted at rest** (`server/shares/encrypted.ts`): a wrapper around the share store seals each brief with AES-256-GCM using the
  ADR-018 key, bound to its link (the token hash), so a snapshot can't be moved to another link. Briefs stored before this change are
  plain and still open until they expire (expand step; no migration needed).
- **Fails closed:** sharing now needs the encryption key as well as the database (`shareStoreFromEnv`); without it, sharing answers
  503 SHARING_NOT_CONFIGURED. (The sharing screens aren't wired to the server yet, so nothing visible changes.)

Pattern choice (pattern-selector): **Decorator** (`encryptedShareStore` wraps any `ShareStore`): encryption is added without
touching the Supabase or memory stores, and works for both. **Snapshot** (Memento-like frozen copy) per Yadira's decision, instead of a
live view, so the patient knows exactly what was shared. The encryption helpers were generalized (`encryptJson/decryptJson` with a
context) so records and shares share one tested implementation.

## Consequences

- Good: doctors get the case in their terms with dates; nothing is shared unless chosen; stored snapshots are unreadable without the key.
- Needs: the ADR-018 key on the server for sharing to work at all.
- Not done here: **the sharing screens still make on-device links** (the server path from ADR-009 waits on Diana's screens: care-team
  form, "Shared with" list, docs/API.md 2e). Until then the case history works in on-device links only; it reaches a doctor's own
  device once those screens call `createShare`.
- Limit: older plain briefs stay plain until they expire (at most 30 days).

## Verification

`server/shareableRecord.test.ts` (16: Theo's snapshot is clinical-only with visits; none for a new user; caps; empty section dropped;
4 malformed cases; crisis; doctor sees the frozen case; stored brief unreadable; older plain briefs open; a sealed brief bound to another
link fails with 500 and no data; crisis via the route; sharing off without the key, on with it). `features/shareable-record.feature`
(4 scenarios). PR 1's crypto tests still pass after the refactor. Mutation-checked: storing the snapshot unencrypted, sharing without the
key, skipping the crisis check on the case, and making a snapshot from a thin record each failed tests.
