---
status: proposed
date: 2026-11-17
deciders: Team 4 full stack (author); playbook wording is Product's (src/data/scripts.ts); layout: Diana (frontend)
---

# ADR-022: Real-time "be-believed" cues during the visit

## Context

Board card "Real-time prompts / checklist during the visit ('be-believed' cues)". Diana's At the visit already has the talking-points
checklist, a "Quiet tip" nudge for uncovered points, and a static playbook panel ("If you hear 'it's probably the depression'…"). Missing:
cues that react to **what is actually being said**. The live transcript (ADR-021) now gives finished pieces of speech as they happen.
The guardrails (ADR-004) forbid advice and diagnosis; the team doesn't pay for AI (ADR-006).

## Decision

`src/lib/cues/cues.ts → detectCues(texts, context)`, run on the device over the live transcript's finished pieces and the quick notes:
- **Moments → playbook lines.** Six specific patterns (just anxiety/stress, probably the depression, you seem fine, give it time, not the
  medication, no test/referral) each map to an existing, reviewed script in `src/data/scripts.ts`. **No new wording is written:** the cue
  is the playbook line, with `[symptom]`, `[change]` and `[date]` filled from the person's record (first uncovered talking point, latest
  medication change, last visit); blanks it can't fill stay for the person.
- **Shown** as a muted panel above the Quiet tip: "Heard: “…”", the situation, "You could say:" and the line, plus "Got it" to dismiss.
  One cue per moment per visit, newest first, at most 2. Polite live region (cues are rare, worth announcing).
- **Talking points that came up** (same words, or the same symptom in doctor terms via the translation engine): "Sounds like “X” came
  up. Mark covered". Never ticked automatically.
- **Crisis words heard → no cues** (the 988 banner shows instead). The speech recognition can't tell who is speaking, so a cue never
  claims what the doctor meant; it only reports what was heard.
- Patterns are deliberately narrow: a missed cue is better than a wrong one in the middle of a visit.

Pattern choice (pattern-selector): a **rules table** (pattern → script id) over a pure function, reusing the playbook library as the
single source of wording (no duplicated copy). Rejected: generating cue text (new unreviewed wording, AI cost); auto-ticking talking
points (changes the person's record without them).

## Consequences

- Good: in-the-moment help with wording Product already reviewed; free; works offline; nothing sent.
- Limit: English, pattern-based; paraphrases outside the patterns are missed. Add a pattern when a real visit shows a miss.
- Limit: no speaker labels, so a patient saying "it's probably the depression" also shows the cue (harmless: it's a suggestion).

## Verification

`src/lib/cues/cues.test.ts` (25: 11 moments, 4 ordinary sentences that must not trigger, filled playbook line, blanks, every reachable
line passes the guardrails, one per moment + newest first + cap, dismissed, crisis, empty, talking point in other words, already
ticked, unrelated). `features/be-believed-cues.feature` (5). Mutation-checked: cues during a crisis, a dismissed cue coming back,
suggesting already-ticked points, and dropping the newest-first cap each failed a test.
