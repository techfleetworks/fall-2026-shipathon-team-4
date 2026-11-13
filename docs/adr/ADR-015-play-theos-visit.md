---
status: proposed
date: 2026-11-13
deciders: Team 4 backend/full stack (author); team choice "version 2" (Nov 13); button placement to confirm with Diana
---

# ADR-015: "Play Theo's visit" in the demo's At-the-visit step

## Context

The data pack's `transcript.txt` says: *"Use: paste/upload into the 'In the room' step to test summary, action items, and
case-building."* Real users never upload files: they record (stretch) or take quick notes (ADR-014). The team chose to let demo
visitors **experience** the in-the-room → after flow: one click, no file, as if Theo's visit had been recorded.

A check of the live deployments found that on the one with Supabase sign-in (`fall-2026-shipathon-team-4.vercel.app`), signed-out
demo visitors get **401** from the summary endpoints. The other deployment (`…-rosy.vercel.app`) has no Supabase, so it answers.

## Decision

- **`POST /api/demo/play-visit` `{ talkingPoints? }`**, public with no sign-in, so it works on both deployments. It only ever summarizes
  the **server's own copy** of Theo's synthetic transcript. Any other field a visitor sends (a transcript, notes) is ignored; only up to
  3 talking points (≤ 300 characters each) are read, to tick the ones that came up. The response carries the synthetic label.
- **Demo-only button** in At the visit (`PlayTheosVisit` in `src/screens/visit/At.tsx`, shown only when `demoMode`): "▶ Play Theo's visit
  (sample recording)". It fills the visit like a recorded one (`recap.source: 'transcript'`, `recording: 'agreed'`, ticked talking
  points, `afterVisit`, Next steps through the same `planAfterVisitUpdate` as real users), then opens After. If the server can't be reached,
  it shows a retry message.
- Wording fixes found along the way: question talking points become "Ask: …?" (not "Ask about What…?"), other talking points start lowercase
  ("Ask about trouble sleeping"), and a question keeps its own "?" (no "timing?.").

## Consequences

- Visitors see the full loop on Theo's upcoming visit: talking points, play, then a plain Recap, ✓ on sleepiness and dizziness, ✗ on the options
  question, and Next steps ("Ask about feeling dizzy when you stand up", "Ask: What are the options…?", "Book a follow-up visit").
- The button is on Diana's screen, so she should confirm the placement and wording.
- **Still open:** other server features (e.g. "Your doctor reads" on Before) still need sign-in on the Supabase deployment, so they're empty for
  signed-out demo visitors there. And the demo still shares storage with a real user on the same device (see the separate-demo-space proposal).

## Verification

`server/demoPlay.test.ts` (works with sign-in required elsewhere; ignores visitor text; limits; saving it like a recorded visit; offline), a scenario
in `features/public-demo.feature`. Mutation-checked: requiring sign-in, accepting visitor text, dropping the input limits, and labelling the played
visit as notes each fail a test. Checked against the running server with sign-in required: protected endpoint 401; play-visit 200 with Theo's summary.
