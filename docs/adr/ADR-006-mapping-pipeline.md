---
status: proposed
date: 2026-11-12
deciders: Team 4 backend (author); review by Diana (frontend), Dominic (Product)
---

# ADR-006: Plain → clinical mapping pipeline, free by default and AI-ready

## Context

Board card "Plain → clinical mapping pipeline (LLM prompts + validated terms)", Week 1, High.
ADR-001 picked Claude Opus 5.5, called only from Express, with structured JSON schemas. **The team
doesn't want to pay for the Anthropic API.** The app already has a free rule-based engine
(`translateStory()`, a word list built from the Starter Pack's `translation_pairs.csv`) and guardrails
(ADR-004). The rules don't expose a quality problem by themselves. An eval was needed to show where they fail.

Forces: zero running cost by default, no invented clinical terms (Copy Drafts §3), crisis first, no
health text in logs, a Vercel function limit of about 10 seconds (Hobby), and a patient who must always get a summary.

## Decision

A pipeline in `server/mapping/` behind `POST /api/prep-summary`, with a **switch that defaults to the free engine**:

| Setting (server env) | Engine |
|---|---|
| `MAPPING_ENGINE` unset or `rules` | Rules only. Free. **Default.** |
| `MAPPING_ENGINE=claude` **and** `ANTHROPIC_API_KEY` set | Claude adds terms the rules missed; rules is the fallback |
| `claude` without a key, or any other value | Rules only (never a paid call without a key) |

Order of the pipeline (`pipeline.ts → runMapping`):

1. **Crisis first.** Crisis language anywhere in the story leads to the crisis path. No engine runs and nothing is sent anywhere.
2. **Rules engine**, the answer every patient gets today.
3. **Optional AI mapper** (`claude.ts`), with an 8-second deadline and request cancellation.
4. **Contract check** (`contract.ts → validateMapping`): every term must be an exact approved term,
   every quote must appear in what the patient wrote, and the answer must have the exact JSON shape (no extra fields).
5. **Guardrails** (`guardResponse`, ADR-004) on the final text.

Any failure at steps 3 to 5 (timeout, API error, refusal, truncation, bad JSON, invented term or quote,
broken rule) quietly returns the **rules answer**. The log records only the reason (no patient words). The AI can
only **add** approved terms. It can't remove, reword or write free text.

Claude call (only when enabled): `claude-opus-5-5` (ADR-001); structured outputs (`output_config.format`,
a JSON schema whose `term` field is an `enum` of the approved vocabulary); `effort: low` (choosing from a fixed
list; the preview should feel quick); a cached system prompt built by `buildSystemPrompt()` so prompt and checks
share the same rules; the story is wrapped in `<patient_story>` as data. **Only the patient's free-text words are
sent.** Chip answers, the medication name and the dose are left out (data minimization). SDK `@anthropic-ai/sdk`
pinned exactly to 1.3.0 (published Oct 23, 2026, at least two weeks old when added).

Tests and eval never use the network: `standIn.ts` plays the AI with hand-written answers in Claude's
exact output shape, including deliberately bad ones. These are **not** recordings of real Claude output.
`npm run eval:mapping` scores any engine on Starter Pack cases plus everyday paraphrases. `-- --live` adds Claude
only if a key is set.

## Consequences

- Good: running costs stay at $0; the AI path is built, tested and documented, so turning it on is two env vars.
- Good: the eval found a real bug in the free engine. The Starter Pack scenario "The sleepiness and dizziness
  started with the new dose" mapped to nothing, because the word list had "sleepy" and "dizzy" only. Fixed. The rules engine now scores
  100% precision and 100% recall on the Starter Pack, and 0% recall on 5 everyday paraphrases (the gap the AI is for).
  The word list was deliberately **not** tuned to those paraphrases, so the eval doesn't flatter it.
- Neutral: `/api/prep-summary` adds `engine: "rules" | "claude"` and `/api/health` adds `mappingEngine`. Both are additive,
  so the screens don't change.
- Bad, only if turned on: each preview pause would be a paid call. If the team ever enables Claude, first limit it
  to Save (not the live preview) or add a cache. No fallback to a second paid model is configured. The
  free rules engine is the fallback, on purpose.
- Not verified: Claude's real answers and accuracy. No key exists, so nothing has run against the live API.

## Alternatives considered

- **Claude by default:** rejected, because it costs money (the team decision).
- **A free hosted model:** rejected for now. That would be another vendor holding health text, and ADR-001 names Claude.
- **Let the AI write the whole summary:** rejected. Free text can't be checked against an approved list. Mapping to an
  enum plus verbatim quotes can.
- **Keep improving the word list only:** that continues anyway, and the eval shows it can't cover paraphrases.

## Verification

`server/mapping/mapping.test.ts`, `claude.test.ts` and `pipeline.guardrail.test.ts`; `server/prepSummary.test.ts`; and the
`features/mapping-pipeline.feature` scenarios (9). Each safety rule was broken on purpose (quote check, crisis-first, no-key
switch, guardrail fallback, approved-term check, the sleepiness fix), and at least one test failed every time.
