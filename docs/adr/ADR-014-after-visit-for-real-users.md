---
status: proposed
date: 2026-11-13
deciders: Team 4 backend/full stack (author); review by Diana (frontend)
---

# ADR-014: After-visit summary and action items for real users (from quick notes)

## Context

The after-visit summary (ADR-011), action items (ADR-013) and suggested questions (ADR-012) first reached only Theo, whose
record carries a transcript. Team requirement (Nov 13): "as backend/full stack, the after-visit summary and action items must be
accessible in the web app", for real users too, not just the demo. Real users have no recording yet (stretch card), so their
source is the visit's **quick notes**, typed or spoken through Diana's At-the-visit live capture ("Your quick notes will feed the recap").

## Decision

- **Server:** `POST /api/notes-summary` `{ notes, talkingPoints? }`. Notes that read like a conversation ("Dr. Kim: …") are
  summarized as a transcript; anything else as notes. Same guardrails, crisis first, nothing stored or logged, 20,000-character limit.
  Done on the server, like the doctor-terms preview.
- **App:** `useAfterVisitSummary(visit)` (`src/lib/afterVisit/useAfterVisitSummary.ts`), called at the top of Diana's Recap and Next
  steps screens. For a visit that has happened and has notes, it asks the server once, then saves:
  - `visit.afterVisit` (marked with which notes it came from, so it re-runs only when the notes or talking points change)
  - `visit.recap` in plain words, **only if there's no recap yet** (a recap the patient fixed is never overwritten)
  - `visit.covered`: talking points that came up are ticked, **never unticked**
  - **Next steps**: the action items, without repeating ones already saved
  Theo's transcript visit is skipped, since it already has its summary. The save logic (`planAfterVisitUpdate`) is pure and tested.
- **Notes-specific fixes found while building it:**
  - Notes are split per sentence, not just per line; one-line notes used to lose the recap.
  - "She will / Dr. Kim is going to / they'll …" are recognized as doctor tasks; titles like "Dr." don't break sentences.
  - Doctor tasks are named as nouns ("Blood test", "Referral to a therapist"), like Diana's own next-step names, so her reminder reads
    "If the blood test hasn't come by Nov 26".

## Consequences

- Good: every user, demo or real, gets a plain recap, ticked talking points and next steps, with no screen changes for Diana.
- Limit: rule-based, so notes in unusual phrasing give a thinner summary. The recap stays the patient's own notes (with clinical words
  swapped) when nothing more can be rewritten.
- Needs the server. If it can't be reached, the screens keep showing the raw notes, as before.

## Verification

`server/notesSummary.test.ts`, `src/lib/afterVisit/useAfterVisitSummary.test.ts`, and a new scenario in `features/after-visit-summary.feature`.
Mutation-checked: overwriting the patient's recap, unticking talking points, not re-running on changed notes, overriding Theo's transcript,
summarizing future visits, not reading spoken notes as a conversation, and ignoring "she will…" tasks each fail a test. Checked in the app as a new
non-demo user: one server call (no loop), the plain recap with ✓ on the talking point, and Next steps listing "Blood test · Dr. Kim",
"Book a follow-up visit with Dr. Kim · in 4 weeks" and "Ask about Trouble sleeping".
