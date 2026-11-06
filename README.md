# fall-2026-shipathon-team-4

Patient-advocacy app for the Tech Fleet Fall 2026 Shipathon (Team 4). Built with the Next.js App Router
and TypeScript, deployed on Vercel. **Synthetic data only, not medical advice.**

## Run it locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (Vitest) + Gherkin scenarios (Cucumber)
npm run build      # production build, same as Vercel
```

## Project layout

| Path | What it is |
|---|---|
| `app/` | Routes (App Router). `app/actions/` holds Server Actions. |
| `components/` | React components, grouped by feature. |
| `lib/` | Framework-free logic and shared types, unit-tested. |
| `features/` | Gherkin scenarios (behavior specs) and their step definitions. |
| `docs/adr/` | Architecture decision records: why things are built the way they are. |

## Transcript intake (first feature)

- `submitTranscript` Server Action: `app/actions/transcript.ts`
- Rules and limits: `lib/transcript/constants.ts`; validation: `lib/transcript/intake.ts`
- Form: `components/transcript/TranscriptForm.tsx`
- Decision record: `docs/adr/0001-transcript-intake-via-server-action.md`

## Engineering standards

This repo follows Tech Fleet's
[enterprise-software-AI-skills](https://github.com/techfleetworks/enterprise-software-AI-skills) standards.
