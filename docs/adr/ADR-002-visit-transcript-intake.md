---
status: proposed
date: 2026-11-06
deciders: Team 4 backend/full-stack (author); review by Diana (frontend) and Product
---

# ADR-002: "In the room" visit transcript intake, client-side for now

ADR-001 lives in the team's planning doc (not in this repo). It sets the MVP as a local-first Vite PWA with an
Express API + Claude later. This record covers only the transcript intake step.

## Context

Product's Synthetic Data Starter Pack asks for Theo's appointment transcript (`transcript.txt`) to be pasted or
uploaded in the "In the room" step, as input for the after-visit summary, action items and case-building
(PRD F5/F8). The crisis row in `scenarios.csv` must stay out of the normal pipeline. Anything built from the pack
must be labelled "Synthetic — illustrative only, not medical advice."

An earlier attempt (PR #2) built this as a Next.js Server Action. The team's app is Vite + React with no server,
so that approach was dropped.

## Decision

- Intake runs **in the browser**, in a framework-free module (`src/lib/transcript/`), called by a new screen
  (`/visits/:id/transcript`) reachable from each past visit.
- Pipeline order: **type check → crisis check (`src/lib/safety.ts`) → clean and validate → build payload**.
  Flagged text goes to `/help/now`, is cleared from the screen, and is never built or saved.
- Uploads are read on the device: `.txt` only, ≤ 512 KB, must decode as UTF-8 with no NUL bytes. The decoded
  text appears in the text box so the patient sees exactly what will be kept.
- Nothing is saved until the patient reviews it and chooses "Save to this visit" (ADR-001 Decision 5).
  It's stored on the visit (`Visit.transcript`) in `localStorage`, with a "Visit transcript" entry in My case.
- The payload (`TranscriptPayload`) carries an ID, a timestamp, the source, stats, the detected speakers, the
  turns, the cleaned text and the synthetic label. It's the hand-off contract for the after-visit summary.
- In demo mode, "Use Theo's sample transcript" loads the Starter Pack file verbatim (`src/data/sampleTranscript.ts`).

## Consequences

- Good: works offline, no backend needed for the demo, and the same module moves to the Express API unchanged.
- Good: the crisis check is shared with the rest of the app, so the behavior is consistent.
- Bad: the keyword check scans the whole conversation, so a clinician's screening question (for example
  "any suicidal thoughts?") also triggers the crisis path. That's a safe failure (support resources are shown),
  but it will happen with real transcripts. Revisit when the classifier arrives with the API.
- Bad: browser-side checks can be bypassed by anyone controlling their own device. Acceptable while data never
  leaves the device; the API must repeat every check server-side.

## Security and safety decision record

| Threat | Rank | Response | Executable check |
|---|---|---|---|
| Crisis language entering the summary pipeline | Critical | Eliminate: crisis check runs first on raw and cleaned text | `@usecase:crisis-fixture`, `@usecase:crisis-evasion` |
| Malicious or binary upload | High | Mitigate: `.txt` allow-list, MIME ignored, strict UTF-8 decode, NUL rejected | `@usecase:upload-wrong-type`, `@usecase:upload-binary-disguised` |
| Huge input freezing the device | High | Mitigate: 512 KB file cap checked before reading, 200,000-character text cap | `@usecase:upload-oversized`, `@usecase:too-long` |
| Transcript content leaking in errors | High | Mitigate: fixed error messages | `@usecase:error-no-leak` |
| Script injection when the transcript is shown | Medium | Mitigate: rendered as React text, never as HTML | Not automated yet (needs a browser test) |
| Control characters / terminal escapes | Medium | Mitigate: stripped during cleanup | `@usecase:control-characters` |

## Not covered yet

- The after-visit summary and action items built from the payload (needs the API + Claude).
- Product's consent/data-handling copy and guardrail wording (due this week).
