---
status: proposed
date: 2026-11-12
deciders: Team 4 backend (author); wording review by Dominic (Product) and the mentor; placement by Diana (frontend)
---

# ADR-008: Plain-language explainer for lab results and clinical notes

## Context

Board card "Plain-language explainer on labs & notes" (Week 1, High; Starter Pack feature F2). Inputs are
Theo's `labs.csv` (test, value, typical range, plus a `plain_meaning` column) and `clinical_note.txt`.
Clinical notes are already covered by the glossary explainer (ADR-007). Lab results need something new:
saying where a number sits, without interpreting it. Interpreting a lab is the step most likely to turn
into a diagnosis ("your glucose means pre-diabetes") or advice. The team doesn't want to pay for AI (ADR-006).

## Decision

`src/lib/labs/labs.ts → explainLab(row)` returns, for each result:
- `position`: `above` / `within` / `below` the range printed on the report (edges count as within);
  `change` for a before → after reading ("118/76 -> 98/64": "top number … down 20, bottom … down 12");
  `no-range` when there is no range; `not-compared` when the value or range can't be read safely.
- `summary`: one neutral sentence, e.g. "104 mg/dL is above the typical range shown (70-99)."
- `about`: what the test measures, from the reviewed glossary (ADR-007).

Rules:
- **Compare only against the range on the report**, never a built-in "normal" table. Ranges differ between labs.
  The response carries `labsNote`: "Typical ranges differ between labs. The range printed on your report is the one that applies to you."
- **Never guess:** different units ("mmol/L" vs "mg/dL"), a range in words ("small drop", "normal"), a backwards
  range or a value with no number → `not-compared` ("Your clinician can explain it.").
- **No interpretation**, not even from the input. The `plain_meaning` column in `labs.csv` (e.g. "worth monitoring on this
  medication") is ignored on purpose, and unknown request fields are dropped. Words like "risk", "elevated" and "should" never appear.
- Output still goes through `guardResponse()` (crisis → crisis path; a rule broken → blocked).

`src/lib/labs/results.ts → explainResults({ labs, note })` combines labs and the ADR-007 note explainer. Crisis
anywhere → crisis for the whole request. Either part blocked → whole answer blocked (never half an answer).
API: `POST /api/explain-results` `{ labs?: [{ test, value, typicalRange? }], note?: string }` (≤ 100 rows,
≤ 200 characters per field, note ≤ 20,000 characters). Client: `requestResultsExplanation()`. `parseLabsCsv()` reads
labs.csv-style files (quoted cells supported). Sample data: `src/data/sampleResults.ts`. Glossary gained
"blood pressure" and "weight change".

## Consequences

- Good: free, instant, the same answer every time, and runs on the device. A patient learns where a number sits and what
  the test is, and the clinician stays the one who says what it means.
- Bad: less "helpful" than an interpretation (e.g. the 20-point drop on standing isn't called significant). That is on purpose. The
  suggested-questions card is the right place to turn it into a question for the clinician.
- Neutral: values with words only ("positive", "negative") or ranges in words aren't compared.

## Verification

`src/lib/labs/labs.test.ts`, `server/explainResults.test.ts` and `features/results-explainer.feature` (6 scenarios).
Mutation-checked: comparing across units, skipping the guardrails, ignoring crisis in the note, accepting a backwards range,
the edge of the range, and the row limit each fail a test.
