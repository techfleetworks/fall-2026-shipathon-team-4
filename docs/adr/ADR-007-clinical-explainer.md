---
status: proposed
date: 2026-11-12
deciders: Team 4 backend (author); glossary wording review by Dominic (Product) and the mentor; placement by Diana (frontend)
---

# ADR-007: Clinical → plain explainer from a reviewed glossary

## Context

Board card "Clinical → plain explainer" (Week 1, High). Patients see clinical language in two places: their
own doctor-terms summary (the approved vocabulary from ADR-006) and what clinicians write or say. Theo's
note (`clinical_note.txt`) is mostly shorthand: "30 y/o", "h/o", "5/52", "?orthostatic hypotension",
"postural BP", "RV in 4/52". The team doesn't want to pay for an AI API (ADR-006), and the guardrails (ADR-004) forbid
diagnosis, advice and dosing.

## Decision

A **glossary** (`src/lib/explain/glossary.ts`) maps each clinical term or piece of shorthand to one short
plain explanation. The explanation says what the word *means*, never that the reader has it or what to do about it.
`explainClinical(text)` (`src/lib/explain/explain.ts`) finds the terms in any text and returns
`{ id, term, kind, found, plain }` in reading order. More specific terms win over terms inside them
("postural BP" over "BP"). Each term is explained once, and each different number of weeks ("5/52", "4/52") once.

Exposed as `POST /api/explain` `{ text }` (20,000-character limit) and the browser client `requestExplanation()`.
The same code also runs on the device. The output still goes through `guardResponse()`: crisis language → crisis path,
and any explanation that breaks a rule → blocked (the honest fallback).

**No AI here, on purpose.** Generated explanations would be free text, and free text can't be checked against
an approved list the way ADR-006's term mapping can. Explanations of medical words should be reviewed by people
once, not generated per request. If a word isn't in the glossary, it's left unexplained rather than guessed.

Gates that keep the glossary safe as people edit it:
- every explanation is run through `checkOutput()` with **nothing to echo** (no diagnosis, advice, dose,
  medication or condition name), checked for crisis words, and capped at 200 characters
- every approved doctor-terms line (ADR-006 vocabulary) must have at least one explanation
- a planted unsafe entry proves the runtime check blocks it

## Consequences

- Good: free, instant, works offline on the device, and the same answer every time. Product and the mentor can edit
  the wording in one file, and the tests re-check every edit.
- Good: the tests found a real miss. "Extrapyramidal" with a capital E wasn't matched (the pattern was case-sensitive).
- Bad: only words in the glossary get explained. New words need a new entry (and a review).
- Neutral: shorthand that also looks like dates ("11/12") or ordinary words ("bp", "rv" in lowercase) is not
  matched on purpose. Only "/52" (weeks) is read as a number of weeks.
- Not decided here: where explanations appear on screen (Diana), for example a "What this means" link under each
  doctor-terms line, or on the after-visit note. The lab-results explainer (labs.csv values) is the next card.

## Verification

`src/lib/explain/explain.test.ts` and `explain.guard.test.ts`, `server/explain.test.ts`, and `features/clinical-explainer.feature`
(7 scenarios). Mutation-checked: unsafe glossary wording, skipping the guardrails, the overlap rule and the length limit each
fail a test. A separate explicit crisis check was removed, because `guardResponse()` already does it and that path is tested.
