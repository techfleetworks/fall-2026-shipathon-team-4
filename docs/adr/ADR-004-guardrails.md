---
status: proposed
date: 2026-11-09
deciders: Team 4 backend (author); review by Diana (frontend), Dominic (Product); crisis copy needs mentor sign-off
---

# ADR-004: Guardrails & disclaimers as a shared module (ticket B1)

## Context

"Week-1 Product & Pitch — Copy Drafts" (Nov 2, 2026), Section 3, sets the boundary the engine must hold:
no diagnosis, no medical advice, no dosing or drug recommendations, stay patient-side, crisis takes priority,
honest about uncertainty. The rules go into the engine (system prompt + output checks); the disclaimer lines
are user-facing copy. The app name isn't locked, so it must not be hardcoded. Today the engine is the
rule-based `translateStory()`; the README plans Claude behind the Express API.

## Decision

One framework-free module, `src/lib/guardrails/`, used by the browser engine today and by the API later:

| File | Purpose |
|---|---|
| `rules.ts` | The six rules, written once. Source for both the prompt and the checks. |
| `systemPrompt.ts` | `buildSystemPrompt({ appName, task, approvedVocabulary })` for the future Claude engine. Rules override user text; user text is data, not instructions; crisis → reply exactly `[[CRISIS]]`. |
| `checks.ts` | `checkOutput(output, { input, approvedVocabulary, clinicalTerms })` → violations per rule. |
| `enforce.ts` | `guardResponse()` wraps every response: crisis in input → crisis path; violation → blocked + honest fallback; else show it. |
| `copy.ts` | The disclaimer lines, verbatim, with an `{app}` token filled by `withAppName()`. |

How the checks decide:
- **Questions are allowed.** Sentences ending in "?" are questions for the clinician (the rules ask for these), so the diagnosis and advice checks skip them. Dosing and unreported-drug checks still apply.
- **Echoes are allowed.** A medication, dose or diagnosis the user reported may be repeated back.
- **Approved vocabulary.** Condition names are allowed only if the user said them or they're in the approved list (e.g. `translation_pairs.csv`). When the engine returns terms as a list, every term must be in that list.
- **Crisis first**, using the app's existing `hasCrisisLanguage()`, on the input and on the output.

The app's existing `DISCLAIMER` now uses Product's exact short line from `copy.ts`.

## Evaluation

`src/lib/guardrails/guardrails.test.ts` runs the rule-based engine over the Starter Pack eval set
(`scenarios.csv` rows, all 15 `translation_pairs.csv` inputs, Theo's prep input). Every output passes every
rule. The safety fixture is caught before translation. Known rule-breaking outputs ("You probably have lupus",
"You should stop taking…", "20 mg twice a day", an unreported drug) are all blocked. Disabling the advice check
or the crisis-first step makes 7 tests fail.

## Consequences and limits

- Pattern checks catch common phrasings, not every possible one. They are the backstop; the system prompt is the
  first defense. Every miss found in evals becomes a new pattern and a new test.
- The medication list is a fixed lexicon of common drugs, not a full formulary.
- "Invented clinical terms" can only be checked mechanically when the engine returns terms as a list; free text
  relies on the prompt. The future Claude engine should use structured output for its clinical terms.
- Checks never log violation excerpts (they may contain health details).

## Open decisions (not decided here)

1. **Crisis copy (ticket B3) — wired in, mentor sign-off still required.** At the team's direction (Nov 9), the
   app and API now use the Copy Drafts crisis message, which routes only to peer support that won't contact
   police without consent (Trans Lifeline, Wildflower Alliance, warmline.org). This replaced 988, Crisis Text
   Line and a "Call 911" card on the crisis screen, the 988 footer, the menu label, the onboarding line and the
   API's crisis response. Copy lives in `src/lib/guardrails/copy.ts`; tests fail if 988/911 come back.
   **Still open for the mentor:** whether to add a clearly opt-in, user-initiated emergency option. Also:
   re-verify the numbers before relying on them, the copy is US-centric, and the lines are not 24/7 (no
   "open now" logic yet). ADR-001's "crisis banner (988/911)" should be updated to match.
   The separate "Not for emergencies" disclaimer (medical emergencies → 911) is unchanged.
2. **"This is AI — double-check it."** The engine isn't AI yet. Showing this line now would claim something we
   don't ship, so it's provided but should only be displayed once Claude is wired in.
3. **Placement** of the long disclaimer, "not for emergencies" and onboarding lines in screens is frontend work.
4. **Fallback wording** (`BLOCKED_FALLBACK`) is a placeholder in the doc's voice; Product to confirm.
5. **Whole-transcript crisis scan.** A clinician's screening question (e.g. "any suicidal thoughts?") in a visit
   transcript triggers the crisis path (see ADR-002). Safe failure; worth a decision before real transcripts.
