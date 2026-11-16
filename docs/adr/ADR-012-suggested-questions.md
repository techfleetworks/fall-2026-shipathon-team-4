---
status: proposed
date: 2026-11-13
deciders: Team 4 backend (author); wording review by Dominic (Product); placement by Diana (frontend)
---

# ADR-012: Suggested questions from goal + history

## Context

Board card: "Suggested questions from goal + history" (Week 1, High). The product's point is being heard: Theo was told
"it's probably the depression" and his dizziness was never checked. The after-visit summary (ADR-011) already records what
wasn't covered. The next visit should start from there. The team doesn't want to pay for AI (ADR-006).

## Decision

`src/lib/questions/suggest.ts → suggestQuestions(record, visit, today)` returns up to 5 questions, each with a `why` taken
from the patient's own record:

| Rule | Source in the record | Example (Theo) |
|---|---|---|
| Not covered last time | last visit's `afterVisit.notCovered` (ADR-011) | "Last time we did not talk about feeling dizzy when I stand up. Can we talk about it today?" |
| Standing blood pressure | same, for dizziness on standing | "Could my blood pressure be dropping when I stand up?" |
| Timing | timeline: medicine changed, then symptoms began within 60 days (or the story's onset) | "This started right after my medicine changed. Could the medicine be causing it?" |
| Choices | when the timing rule applies | "What are my choices? A lower dose, a new medicine, or a new time to take it?" |
| Put down to something | last visit's summary or timeline ("attributed to depression") | "If this is not the depression, what else could it be?" |
| Plan | last visit's plan or follow-up | "If it is not better by then, what will we try next?" |

Rules:
- **Grounded only**: no history means no suggestions. A medicine change months before a symptom isn't linked.
- **Questions, never advice**: they never name a medicine, a dose or a condition the patient didn't raise. Every possible question
  passes `checkOutput` with nothing to echo and reads at grade ≤ 6 (tested).
- **In the patient's voice** (`firstPerson()`: "when you stand" → "when I stand").
- **No repeats**: questions that mostly repeat an existing talking point are skipped.

Shown in Diana's talking-points step through the existing suggestion chips (`Priorities` → "From your story"), before the
symptom suggestions. One tap adds a question as a talking point (up to her 3-point limit).

## Consequences

- Good: Before and After connect. What was skipped last time becomes what to ask next, with the reason.
- Good: free, deterministic, and runs on the device.
- Limit: the chips appear only when a visit has fewer than 3 talking points. Theo's next visit already has 3 (from `personas.json`),
  so in the demo they appear after removing one. Diana may prefer a separate "Questions to ask" list with the `why` shown, and the label
  "From your history".

## Verification

`src/lib/questions/suggest.test.ts` (Theo with his after-visit summary; built-in Theo from the timeline only; no history; old medicine change;
cap; every question's reading level and guardrails; first-person voice), `features/suggested-questions.feature` (4 scenarios).
Mutation-checked: repeating talking points, linking any old medicine change, not using the patient's voice, no cap, and inventing a cause
each fail a test. Checked in the app: Theo's talking-points step showed 4 chips; tapping one added it as a talking point.
