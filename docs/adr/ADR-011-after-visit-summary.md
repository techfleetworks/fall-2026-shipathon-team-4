---
status: proposed
date: 2026-11-13
deciders: Team 4 backend (author); wording review by Dominic (Product); screen placement by Diana (frontend)
---

# ADR-011: Plain-language after-visit summary, translation pairs in reverse

## Context

Board card: "Plain-language after-visit summary from the transcript." Depends on: a transcript, pasted or uploaded
(baseline) or live-captured (stretch). Team clarifications (Nov 13):
- During a visit the patient either **records** (with consent) or takes **quick notes**. There is no paste or upload in the visit
  flow. In the demo, Theo's visit has already happened, so his transcript is already in his record.
- After the visit, the patient gets a **plain-language summary at a 6th-grade reading level**. Transcribing audio into text is a
  separate (stretch) card. This card turns the written transcript into simple words.
- The Starter Pack's `translation_pairs.csv` runs **plain → clinical** (patient to doctor, "See it in doctor terms"). **The
  after-visit summary runs the other way, clinical → plain** (doctor to patient).

## Decision

`src/lib/afterVisit/` (free, rule-based, runs on the device and the server):
- `reversePairs.ts`: every Starter Pack pair (all 15) and every approved term (19) reversed. `jargon` finds how a doctor says it,
  `topic` tells whether a subject came up at all, and `plain` gives the patient-side words ("orthostatic hypotension" → "feeling
  dizzy when you stand up").
- `readability.ts`: Flesch-Kincaid grade, target **≤ 6**. Every patient phrase and the whole summary are held to it in tests.
- `summary.ts → summarizeVisit(transcript, { patientName, talkingPoints })` returns:
  - **youRaised**: symptoms the patient brought up (the app's plain → clinical match, said back in patient words), "started after
    the dose changed", and "you asked if the medicine could be the cause"
  - **doctorSaid**: recognized patterns rewritten plainly ("it's probably the depression" → "The doctor thinks this is from
    the depression"; "your body adjusts in a few weeks"; "possible, but…"). **A sentence it can't rewrite is quoted, with clinical
    words swapped, never guessed.**
  - **plan**: "Wait and see for now", "No change for now", "Check again next month / in two weeks"
  - **notCovered**: things the patient raised that the doctor never talked about, and talking points that never came up
  - `talkingPoints[].raised`, `readingGrade`, `meetsReadingTarget`
- `summarizeNotes(notes)` for visits with only quick notes. A transcript with no recognizable dialogue falls back to it instead of
  returning nothing.
- Every summary goes through `guardResponse` (crisis first; no diagnosis, advice or doses). It reports what was said and never
  judges whether the doctor was right.

Wiring:
- `Visit.afterVisit` (new optional field in `types.ts`).
- Theo's record (`npm run seed:theo`): his past visit's `recap.doctorSaid` is now the plain-language lines (Diana's Recap
  already promises "Plain words, about a 6th-grade reading level"), and `covered` marks the talking points that came up.
- `POST /api/visit-summary` adds `summary` (and optional `talkingPoints`, up to 3), for when recording and transcription exist.

## Consequences

- Good: Theo's Recap reads plainly, his talking point shows as covered, and the summary surfaces what Dr. Lane never addressed
  (the dizziness on standing), which is the product's point. Grade 3.4 on Theo's transcript.
- Good: free and deterministic. The Claude switch (ADR-006) could later handle conversations the patterns don't cover.
- Limit: it recognizes common patterns only. Unusual sentences are quoted (with clinical words swapped), not paraphrased.
- Screens (Diana): the **plan** and **not covered** parts are stored on the visit (`visit.afterVisit`) but not shown yet.

## Verification

`src/lib/afterVisit/afterVisit.test.ts` (all 15 pairs and 19 terms reversed; reading level; Theo end to end; jargon; unknown sentence
quoted; notes; crisis), `afterVisit.guard.test.ts` (a planted unsafe phrase is blocked), `server/visitSummary.test.ts`,
`features/after-visit-summary.feature` (5 scenarios). Mutation-checked: no reverse-pair swap, never flagging what wasn't covered, a broken
reading score, an empty summary when there's no dialogue, and skipping the guardrails each fail a test. The explicit crisis check is backed
up by the guardrails' own crisis check (removing it alone changes nothing). Checked live: Theo's Recap on Diana's screen shows the plain lines
and ✓ on his talking point.
