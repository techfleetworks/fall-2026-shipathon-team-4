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

**Wired into the live app (Nov 11).** `src/lib/engine.ts` → `translateStoryGuarded()` runs every "See it in doctor
terms" output through `guardResponse()` before the patient sees it: crisis → crisis path (engine not run); a broken
rule → the honest fallback with "Back to my story" and nothing can be saved; otherwise the summary shows. Symptom
terms must come from the approved vocabulary. The engine is a parameter, so the future Claude engine (and the
server's `/visit-summary`) get the same checks. Bypassing the check makes 6 tests fail.

**Moved to the backend (Nov 11).** The doctor-terms step now calls `POST /api/prep-summary`, so the engine and
the guardrails run on the Express server (ADR-001: AI tasks run only in Express). The device still checks for
crisis first so crisis text is never sent, and if the server can't be reached the screen says so and translates
nothing locally.

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

1. **Help page and crisis handoff (ticket B3) — follows the team decision (ADR-001 update, Nov 10–11).**
   Help page: "Places to start if you need help.", order warmline directory → 988 → 911, no breathing card, 988 a
   neutral card "for when you're in crisis" ("Free, 24/7"), 911 the red emergency card. When self-harm or
   suicidal intent is typed anywhere, the app surfaces 988 directly (first, under a gentle handoff), never folds
   it into a brief, and uses no active-rescue or police framing. This supersedes the Copy Drafts' peer-only
   crisis message (Nov 9), which was removed. Content lives in `src/lib/guardrails/copy.ts`; the API's crisis
   response uses the same content. Every other page keeps the existing "Call or text 988" footer; the Help page's own footer shows the Copy Drafts short line (Trans Lifeline · Wildflower Alliance · warmline.org), per the team (Nov 11). That footer is the only place police are mentioned; the handoff and cards have none.
   **Gap fixed:** "Skip - I am not sure" in Tell my story skipped the crisis check, so typed crisis text could
   reach the summary and brief. Skip now runs the check, and `storyDraftHasCrisis()` is a backstop before any
   summary is built. Tests cover 8 phrasings × 7 story steps.
   **Open:** Diana's redesign (`feat/hifi-screens`) replaces this Help page and the story flow; it should adopt
   `HELP_RESOURCES` / `CRISIS_DETECTED_RESOURCES` and keep the crisis check on every path (including skips).
   Re-verify numbers and links before launch; US-only. "988 first when detected" is our reading of "surface 988
   directly"; confirm with the team.
2. **"This is AI — double-check it."** The engine isn't AI yet. Showing this line now would claim something we
   don't ship, so it's provided but should only be displayed once Claude is wired in.
3. **Placement** of the long disclaimer, "not for emergencies" and onboarding lines in screens is frontend work.
4. **Fallback wording** (`BLOCKED_FALLBACK`) is a placeholder in the doc's voice; Product to confirm.
5. **Whole-transcript crisis scan.** A clinician's screening question (e.g. "any suicidal thoughts?") in a visit
   transcript triggers the crisis path (see ADR-002). Safe failure; worth a decision before real transcripts.
