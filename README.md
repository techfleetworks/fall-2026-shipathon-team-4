# Appointment Ready (fall-2026-shipathon-team-4)

A progressive web app that helps people with depression and anxiety tell their story in their own words, see it in doctor terms, and walk into a visit with a one-page brief.

> **Synthetic — illustrative only, not medical advice.** The demo uses the fictional persona Theo Marsh from the Synthetic Data Starter Pack.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build + service worker (dist/)
npm run preview    # serve the production build, installable as a PWA
```

On the landing page, **Explore with demo data (Theo, synthetic)** loads a seeded case with a medication change, a dismissive visit and an upcoming visit.

## What this version is

| Area | MVP choice |
|---|---|
| Stack | Vite + React 18 + TypeScript, React Router, Zustand, `vite-plugin-pwa` (offline app shell, installable) |
| Data | **Local-only.** Approved records are stored in `localStorage`. The in-progress story draft is in `sessionStorage` and is discarded when the tab closes (ADR-001 Decision 5). No accounts, no server. |
| Translation | **Rule-based** (`src/lib/translate.ts`), using the vocabulary from `translation_pairs.csv` plus the answers from the guided steps. Each clinical line keeps the patient's own words next to it, and anything missing reads "Not discussed". |
| Safety | A keyword crisis check (`src/lib/safety.ts`) runs on every free-text input **before** translation. Flagged text is never saved, and the user is taken to 988 resources. It catches passive phrasing, including the Starter Pack safety fixture. |
| Voice | "Hold to talk" uses the browser's Web Speech API where it's available (Chrome, Safari). Typing always works. |
| PDF | "Export as PDF" opens the doctor view and the browser print dialog, styled with print CSS. |
| Sharing | Uses the native share sheet, or copies plain text to the clipboard. Secure share links need accounts and a backend. |
| Reminders | Shown in-app on Home. Push notifications need a backend. |

## Screens

Landing · Onboarding (who / what brings you / privacy & consent / name / next visit) · Home · Tell my story (opening + 5 steps) · See it in doctor terms (edit wording) · Saved · My case (+ add evidence) · One-page brief · Show in the room (doctor view) · Morning-of prep · Breathing · Post-visit check-in · Escalation scripts · Follow-up "did it happen?" · Scripts (+ practice) · Peer playbooks (+ share what helped) · Visits · Settings (text size, download data, delete everything) · Crisis help · Caregiver placeholder.

## Next steps (per PRD / ADR-001)

- Express API + Claude for the follow-up questions, the SOCRATES summary, the after-visit summary and the lab/note explainer. Swap `translateStory()` for the API call, and keep the rule-based version as the fallback.
- Supabase auth + storage (RLS, hard delete), then real share links and push reminders.
- "In the room" transcript paste/upload and the after-visit summary (F5/F8), plus the lab/note explainer (F9).
- Clinical and PM review of the script and playbook copy (`src/data/`).

## Backend (API)

An Express server in `server/app.ts`, deployed on Vercel as a serverless function (`api/index.ts`) on the same
address as the app. It runs the doctor-terms engine and guardrails (`POST /api/prep-summary`) and transcript
intake (`POST /api/transcripts`). It stores nothing and never logs request bodies.

```bash
npm run dev       # app
npm run dev:api   # API server, in a second terminal (the app forwards /api to it)
npm test          # unit, API and Gherkin tests (CI runs these on every PR)
```

- **Frontend guide:** [`docs/API.md`](docs/API.md): what to send, what comes back, and the crisis rules every screen keeps.
- **Sign-up / log-in server:** Supabase Auth, checked by the API on every request. Setup: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Without it, the app keeps its on-device demo sign-in.
- **Decisions:** `docs/adr/` (ADR-002 transcript intake, ADR-003 Express on Vercel, ADR-004 guardrails, ADR-005 Supabase sign-in).
