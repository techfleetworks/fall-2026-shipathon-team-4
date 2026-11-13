---
status: proposed
date: 2026-11-13
deciders: Team 4 backend (author); review by Diana (frontend), Dominic (Product)
---

# ADR-013: Action items extracted from the visit

## Context

Board card: "Extract action items" (Week 2, Medium). Diana's After → **Next steps** screen already lists a visit's follow-ups
(what, who, by when, with "Remind me" / "Add visit"). The after-visit summary (ADR-011) already finds the plan and what wasn't
covered in the transcript (or quick notes). The team doesn't want to pay for AI (ADR-006).

## Decision

`src/lib/afterVisit/actionItems.ts → extractActionItems(summary, { visitDate, clinician, upcomingVisits, existing })`, using only
what the summary found:

| Source | Action item | Owner |
|---|---|---|
| The plan the clinician set ("we'll reassess next month") | "Book a follow-up visit with Dr. Lane", dated from the plan | You |
| What the clinician said they'd do ("let us run a thyroid panel") | "Run a thyroid panel and an ECG" | The clinician (or "The clinic") |
| Raised but not talked about / talking points that never came up | "Ask about feeling dizzy when you stand up", due at the next visit | You |

- **No duplicates:** "book a follow-up" is skipped when a visit with the same clinician is already on the calendar within two weeks of
  the planned date, and "ask about" items are then due at that visit. Items already saved as follow-ups are skipped.
- **Nothing invented:** no plan and no promise means no follow-up or doctor task. Doctor instructions like "push through" are reported in
  the summary, not turned into tasks.
- The summary gained `promised` (things the clinician said they'd do) and rewrites those sentences as "The doctor will …".
- Shaped like `FollowUp`, so Diana's Next steps screen lists them with no screen change. Theo's record (`npm run seed:theo`) adds them to
  his follow-ups. `POST /api/visit-summary` returns `actionItems` (dated from today).

## Consequences

- Good: Theo's Next steps now shows "Ask about feeling dizzy when you stand up · You · by Dec 3", the thread that runs from the visit to
  the suggested questions (ADR-012).
- Limit: rule-based. Promises are recognized only in common phrasings ("I'll / we'll / let's" + order, run, schedule, refer you, book,
  call you, check…). Others stay quoted in the summary.

## Verification

`src/lib/afterVisit/actionItems.test.ts`, `server/visitSummary.test.ts`, `features/action-items.feature` (3 scenarios). Mutation-checked:
duplicating a booked follow-up, counting another clinician's visit as booked, repeating saved follow-ups, a wrong follow-up date,
dropping doctor promises, and Theo getting no items each fail a test. Checked in the app: Theo's Next steps lists the new item.
