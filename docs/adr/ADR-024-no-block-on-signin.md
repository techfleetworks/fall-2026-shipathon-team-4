---
status: proposed
date: 2026-11-20
deciders: Team 4 full stack (author); Diana (frontend) wrote the fallback as a user-testing stopgap, made permanent here
---

# ADR-024: A missing or expired sign-in never blocks "Name how I feel"

## Context

Reported from user testing and the demo site: on Before the visit → Name how I feel, typing a story or pressing Continue showed
"Your sign-in has expired. Please log in again" and Continue never moved on. Cause: once a site has Supabase sign-in configured,
`POST /api/prep-summary` requires a valid token (server/auth.ts `requireUser`); without one it answers 401, the client turned 401
into that message, and Continue treated it as a hard stop. People without a token: demo visitors using "Explore with demo data"
(since the demo site got its Supabase settings on 2026-11-18), on-device accounts (Diana's first-name-only test sign-up, never
merged), and real users whose sign-in expired. Meanwhile, when the server was *unreachable*, the screen already fell back to the same
rules engine on the device.

`/api/prep-summary` stores nothing; it only turns words into doctor terms with the same engine and guardrails the device has.

## Decision

`src/lib/storySummary.ts → requestStorySummary` (Diana's stopgap, cherry-picked with her authorship, then extended):
- Server first. If the server can't be reached **or answers 401**, use the built-in engine (`translateStoryGuarded`: same rules,
  guardrails and crisis check).
- If the device **had** a server sign-in (an expired one), the answer carries `signInExpired`; the "Your doctor reads" panel shows a
  note that doesn't block: "Your sign-in has expired, so this was done on this device. Log in again to keep your record backed up."
- Continue always saves and moves on (crisis → crisis support, as before).
- The server keeps requiring sign-in for these routes (no change server-side): when the Claude engine is switched on (ADR-006) the
  route costs money, so it shouldn't be open to anyone.

## Consequences

- Good: nobody gets stuck; demo visitors and expired sessions continue; no server change; free.
- Limit: other screens that call the server (explainers, after-visit summary from notes, sharing) still show "sign-in expired" on a
  401. Follow-up: give the ones with an on-device engine the same fallback.
- Found while testing: the word engine doesn't recognize curly apostrophes ("can’t sleep", typed by iPhones) — separate follow-up.
- Diana's first-name-only sign-up (on her `feat/user-test` branch) stays unmerged; user testing has ended.

## Verification

`src/lib/storySummary.test.ts` (7: server answer used; unreachable → device; 401 without sign-in → device, no note; 401 with an expired
sign-in → device + note; device engine produces doctor terms; crisis on the device path; other answers passed through),
`features/story-without-signin.feature` (3). Mutation-checked: making 401 block again (4 tests failed), dropping the expired note (1).
