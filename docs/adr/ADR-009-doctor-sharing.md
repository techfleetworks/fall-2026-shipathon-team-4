---
status: proposed
date: 2026-11-12
deciders: Team 4 backend (author); team notes Nov 12 (flow, per-person stop, delete edge case); review by Diana (screens), Dominic (Product), mentor (privacy)
---

# ADR-009: One-page doctor brief, shared per person through expiring server links

## Context

Board card "1-page doctor briefing" (Week 1, High). Diana's screens already show the brief (`DoctorBriefBody`)
and make "share" links. But those links were **looked up in the patient's own phone storage**, so a doctor
couldn't open one on their own device. The team's notes (Nov 12) set the flow:

- Email the link to the doctor (simpler than patient-portal integrations).
- Doctor details: email and hospital/clinic affiliation, not just a name (think Zocdoc-style profiles).
- "Stop sharing" lists each person separately (PCP, therapist, psychiatrist…). Stopping one doesn't affect others.
- Deleting the account: decide whether it stops all shares. Consider "type DELETE to confirm".

ADR-001 Decision 5 allows approved structured records to persist on the server. A shared brief is one: the
patient approves it by sharing.

## Decision

1. **One link per person.** `POST /api/shares` takes `{ brief, recipient: { name, role, email, clinic }, days 1–30 }`.
   The server rebuilds the brief from known fields and **fits it to one printed page** (`server/shares/brief.ts`: 3 priorities,
   6 symptom lines, 5 timeline items; long text shortened with "…" and `trimmed: true`), refuses crisis language
   (crisis support instead), and stores it with the person.
2. **Link = 256-bit random token; only its SHA-256 hash is stored.** The path `/shared/<token>` is returned once.
   A database leak can't be turned into working links.
3. **Doctor view:** `GET /api/shared/:token`, public, read-only, `no-store`, `X-Robots-Tag: noindex`.
   404 unknown · 410 expired · 410 stopped. The doctor sees the recipient's name and role, not their email.
   `/shared/:token` (Diana's page) now asks the server when the link isn't on this device.
   **An open page clears instantly when sharing stops.** On stop-one, stop-all and account deletion the server broadcasts a
   data-free "stopped" message over Supabase Realtime (`server/shares/notify.ts`, sent over HTTP so the serverless function
   needs no open connection) on channel `share:<sha256(token)>`. Only someone holding the link can work that channel out.
   The page (`src/lib/shareSignal.ts`) treats it as a hint and asks the server before clearing, so a forged message can't
   hide a working link. Measured live: **about 1.5 s** from pressing Stop to the doctor's screen changing. Backup
   (`src/lib/sharedBriefWatch.ts`): re-check every 30 s while visible, on returning to the tab, and at expiry, in case the
   live connection drops. A failed signal never fails the stop. A network blip keeps the brief; only a definite
   stopped, expired or missing answer ends it.
4. **Stop sharing:** `DELETE /api/shares/:id` stops one person. `DELETE /api/shares` stops everyone. `GET /api/shares`
   lists one row per person (no tokens). Every query is scoped to the signed-in user, so one patient can never see or
   stop another's links.
5. **Deleting the account stops every share**, immediately: both tables use `ON DELETE CASCADE` from `auth.users`. This answers
   the open question in the notes. "Type DELETE to confirm" is a screen pattern, handed to Diana.
6. **Email = the patient's own email app** (`mailto:`, `src/lib/shareEmail.ts`). Free, no email service, and our server never
   sends health links. The email holds only the link and its end date, never health details. Line breaks are stripped
   so the fields can't add recipients.
7. **Storage:** Supabase tables `care_team` and `shared_briefs` (migration `20261112000000_shared_briefs.sql`) with RLS
   (read own rows only) and size and format checks. `server/shares/store.ts` has a Supabase store and an in-memory store
   with the same behavior (tests, local dev).

## Consequences

- Good: the doctor link works on any device. The patient controls each person separately, and deleting the account ends all sharing.
- Privacy cost: briefs the patient shares now live on the server until the account is deleted (stopped and expired rows stay so
  the "Shared with" list stays accurate). **Follow-ups:** a cleanup job for old links, and the privacy page wording (mentor).
- The share form and "Shared with" list are screens (Diana). Until she adds them, the old on-device links keep working for the demo.
- Not covered: a view count or "opened" status; rate limiting on `/api/shared` (tokens are 256-bit, so guessing isn't practical).

## Alternatives considered

- **Send the email from our server** (Resend/SendGrid): costs money or adds a vendor, and puts our server in the email path. Rejected for now.
- **Patient-portal (EHR) integration:** the notes call it out as harder. Not now.
- **One link for everyone:** can't stop one person without breaking the others (the notes' main ask).
- **Store the token itself:** a database leak would leak working links. Rejected.

## Verification

`server/shares.test.ts`, `server/shares/brief.test.ts`, `src/lib/shareEmail.test.ts`, and `features/doctor-sharing.feature` (6 scenarios:
doctor opens link, stop one keeps others, delete account ends all, another patient can't touch links, crisis not shared, guessed
link opens nothing). Mutation-checked, and each of these fails a test: stopping someone else's link, a stopped or expired link still opening, sharing
crisis text, stop-one stopping all, storing the raw token, email header injection, and accepting any email. One check (the token format) only
saves work and changes nothing visible. The Supabase store's queries are covered only by review and the RLS policies. CI has no database, so
check once live after running the migration.
