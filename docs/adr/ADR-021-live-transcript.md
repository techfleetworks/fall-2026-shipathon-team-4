---
status: proposed
date: 2026-11-17
deciders: Team 4 full stack (author); layout and wording of the Recording bar: Diana (frontend)
---

# ADR-021: Partial / low-latency transcript handling

## Context

Board card "Partial / low-latency transcript handling". At the visit already records (with both people's consent) using the
browser's free speech recognition (Diana's Recording bar; the paid Deepgram option was skipped, ADR-001). Problems found:
1. **No live words.** `interimResults` was off, so nothing appeared until Stop.
2. **Data loss.** Captured text lived only in memory until Stop: a closed tab, dead battery or refresh lost the whole visit.
3. **No crisis check** on spoken words during the visit (typed quick notes had one).

Browsers report a growing list of results per listening session, each FINAL (never changes) or INTERIM (keeps being revised),
and end a session after silence (the app restarts it, and the list starts from zero). Some report a phrase twice.

## Decision

- **Pure state machine** (`src/lib/transcript/live.ts`): `segments` (finished pieces, in order, taken once per session via a
  `consumed` count) and `interim` (shown live, never saved). A session that ends with interim words keeps them; a repeat of the
  previous piece is dropped; text is tidied and capped (1,000 characters a piece, 2,000 pieces). `toSentences()` makes recap lines.
- **Controller without React** (`liveCapture.ts`): owns the recognizer (interim on, continuous, restart after silence), pause/stop
  (keep unfinished words, ignore late events), and `take()`. Tested with a fake microphone.
- **Thin hook** (`useLiveTranscript.ts`) saves each finished piece to the visit **as it arrives** (`visit.live`, on the device; with
  backup on it is also in the encrypted backup, ADR-018/019). On Stop, or the next time the screen opens after an interrupted capture,
  the pieces become recap sentences and `visit.live` is cleared.
- **Recording bar** (Diana's `CaptureBar` in `At.tsx`): same layout and buttons, plus a live "Hearing: “…”" line (not announced by screen
  readers, since it changes constantly), a "N saved" count, and a note when text from before the page closed was recovered.
- **Crisis:** the existing quick-notes 988 banner now also checks the live finished text.

Pattern choice (pattern-selector): **State machine as a pure reducer** (events → state) for the tricky part, a **humble object** split
(controller vs React hook) so the logic is testable without a browser, and **write-ahead persistence** (save each finished piece before
it's needed) instead of saving on Stop. Rejected: adding a DOM test environment just for this; saving interim words (they change many
times a second and would be wrong).

## Consequences

- Good: words appear as spoken; nothing captured is lost on a crash; free; works offline; no audio kept.
- Limit: browser speech recognition only (Chrome, Edge, Safari; not Firefox). Accuracy and punctuation are the browser's.
- Limit: interim words are never saved; a piece the browser never finalizes is kept at the next pause, silence or Stop.
- Next: the "be-believed" cues card can read the live finished pieces to react to what's said.

## Verification

`src/lib/transcript/live.test.ts` (8), `liveCapture.test.ts` (8, fake microphone: live words on, live before final, saved the moment
it's final, restart after silence, pause keeps unfinished words and ignores late events, resume, stop, recovery after the page closed),
`features/live-transcript.feature` (4). Mutation-checked: live words off (1 test failed), unfinished words dropped at a pause (4),
not saving as it goes (5), late words accepted after pause (1).
