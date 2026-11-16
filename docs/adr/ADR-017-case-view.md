---
status: proposed
date: 2026-11-15
deciders: Team 4 backend (author); wording and placement review by Diana (frontend) and Dominic (Product)
---

# ADR-017: Case view, patterns across visits

## Context

Board card: "Clinically-legible case view" (High). The plan (ADR-001) named a `/api/case-summary` endpoint returning
`patterns[{ description, evidence_refs[] }]`, `open_questions[]` and `timeline_highlights[]`. Diana's **My history** screen already
shows a doctor summary and a dated timeline, but nothing points out what repeats across visits (e.g. a symptom that began right after a
dose change, a concern raised twice and still not addressed).

Forces:
- The record lives **on the device** (zustand + localStorage). The Visit store card (database + sync) is not built yet.
- The team doesn't want to pay for AI (ADR-006), so the engine is rule-based, with Claude possible later behind the same shape.
- **Real users start empty.** Team feedback: a new user has no story, visit or case yet, and the Theo demo hides that. The case view
  must never fill the space with guesses.
- Guardrails (ADR-004): show timing, never cause; no diagnosis, no advice, no new medicine names.

## Decision

One pure function, `buildCaseView(record, today)` in `src/lib/caseView/caseView.ts`, used in two places:

1. **On the device**: the new `CasePatterns` panel on My history runs it on the record already there. Nothing is sent anywhere,
   it works signed out and offline, and it updates the moment a date is added.
2. **On the server**: `POST /api/case-summary` (stateless: the record comes in the body, nothing stored or logged) for a future Claude
   engine or other clients. Inputs are parsed to known fields with limits (`server/caseInputs.ts`).

| Rule | Needs | Example (Theo) |
|---|---|---|
| Timing | a symptom entry 0–60 days after a medication change | Oct 13: "Daytime sleepiness and dizziness on standing began". That was 2 days after a medication change (…, Oct 11). |
| Raised again | the same talking point at 2+ visits (2+ shared content words) | You've brought up "Daytime sleepiness since the dose change" at 2 visits (Nov 7, Dec 5). |
| Felt unheard | felt heard ≤ 2/5 at 2+ past visits | (Theo has one such visit, so no pattern; it shows as a key date) |
| Open: overdue | a next step past its due date with no outcome, or "didn't happen" | "Blood test": what happens next? |
| Open: not covered | the last visit's talking points that never came up | "Dizzy" didn't come up yet. |
| Key dates | medication changes, first symptom, past visits (last 6) | [Nov 7] Visit with Dr. Lane · felt heard 2/5 |

Rules:
- **Grounded only.** Every pattern cites the entries it came from (`refs`). Fewer than 2 dated entries → `enough: false` and empty lists.
- **Timing, not cause.** Wording never says "caused", "because", "due to" or "side effect" (tested), and every line passes `checkOutput`.
  A fixed `note` says the dates show timing, not cause.
- **Crisis first.** Crisis language anywhere in the record → `{ status: 'crisis' }` and nothing is built; the panel links to Help.

Pattern choice (pattern-selector): a **pure function** (functional core) with no store or network access, so the device and server share
it and tests need no setup. Rejected: a Strategy interface for "rules vs Claude" now (only one engine exists; the mapping pipeline
already shows how to add one when needed, ADR-006). Rejected: calling the server from the screen (sends the whole history over the
network for no gain while the engine is free and local).

## Consequences

- Good: real, honest value from the record people already keep; a clear empty state for new users.
- Good: free, deterministic, offline. Claude can replace the engine later behind `CaseView`.
- Limit: matching is word-based, so "dizzy when standing" and "lightheaded on getting up" are not seen as the same concern.
- Limit: the panel's wording and placement are a first draft. Diana and Dominic should review (flagged in the PR and `docs/API.md` 2l).
- Limit: when the Visit store lands, the server could read the record itself instead of receiving it.

## Verification

`src/lib/caseView/caseView.test.ts` (18: empty and thin records, each rule and its boundaries, overdue and not-covered, highlight cap,
crisis, "never says cause", Theo), `server/caseSummary.test.ts` (12: ok, empty, crisis, 8 kinds of bad input, 415/405),
`features/case-view.feature` (6 scenarios). Mutation-checked: lowering the 2-entry minimum and linking symptoms that came before the
change each failed tests. Checked in the app: My history for a new user and for Theo.
