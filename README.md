# Get Heard (fall-2026-shipathon-team-4)

A progressive web app that helps people with depression and anxiety tell their story in their own words, see it in doctor terms, and walk into a visit with a one-page brief.

> **Synthetic — illustrative only, not medical advice.** The demo uses the fictional persona Theo Marsh from the Synthetic Data Starter Pack.

## Run it

```bash
npm install
npm run dev        # web app: http://localhost:5173
npm run dev:api    # API server (in a second terminal): http://localhost:3001/api/health
npm run build      # type-check app + server, then production build + service worker (dist/)
npm run preview    # serve the production build, installable as a PWA
npm test           # unit tests (Vitest) + Gherkin scenarios (Cucumber)
```

On the landing page, **Explore with demo data (Theo, synthetic)** loads a seeded case with a medication change, a dismissive visit and an upcoming visit.

## API (backend)

An Express server in `server/app.ts`, deployed on Vercel as a serverless function (`api/index.ts`) on the same domain as the app. Locally, `npm run dev:api` runs it on port 3001, and the web app's dev server forwards `/api` to it. See `docs/adr/ADR-003-express-api-on-vercel.md`.

| Endpoint | What it does |
|---|---|
| `GET /api/health` | `{ "status": "ok" }` if the server is up |
| `POST /api/transcripts` | Body `{ "transcript": "...", "source": "paste" }`. Runs the same checks as the app (crisis check first). `201` with the payload, `200` with peer-support resources and no payload for crisis language, `400` / `413` / `415` for bad input. Stores nothing. |

```bash
curl -X POST http://localhost:3001/api/transcripts -H "Content-Type: application/json" \
  -d '{"transcript": "Theo: I get dizzy when I stand.\nDr. Lane: Give it time.\nTheo: It started with the new dose."}'
```

No authentication or rate limiting yet, so don't add endpoints that cost money (AI calls) until those are in place.

## What this version is

| Area | MVP choice |
|---|---|
| Stack | Vite + React 18 + TypeScript, React Router, Zustand, `vite-plugin-pwa` (offline app shell, installable) |
| Data | **Local-only.** Approved records are stored in `localStorage`. The in-progress story draft is in `sessionStorage` and is discarded when the tab closes (ADR-001 Decision 5). No accounts. The API (below) exists but the app doesn't send it data yet. |
| Translation | **Rule-based** (`src/lib/translate.ts`), using the vocabulary from `translation_pairs.csv` plus the answers from the guided steps. Each clinical line keeps the patient's own words next to it, and anything missing reads "Not discussed". |
| Safety | A keyword crisis check (`src/lib/safety.ts`) runs on every free-text input **before** translation. Flagged text is never saved, and the user is taken to peer-support resources that won’t call the police unless asked (Copy Drafts §3, pending mentor sign-off). It catches passive phrasing, including the Starter Pack safety fixture. |
| Voice | "Hold to talk" uses the browser's Web Speech API where it's available (Chrome, Safari). Typing always works. |
| PDF | "Export as PDF" opens the doctor view and the browser print dialog, styled with print CSS. |
| Sharing | Uses the native share sheet, or copies plain text to the clipboard. Secure share links need accounts and a backend. |
| Reminders | Shown in-app on Home. Push notifications need a backend. |
| In the room | Paste or upload (`.txt`) what was said at a visit (Visits → a past visit → "Add what was said in the room"). Crisis check first, then cleaned, split into speaker turns, reviewed and saved to the visit. Demo mode can load Theo's Starter Pack transcript. See `docs/adr/ADR-002-visit-transcript-intake.md`. |

## Screens

Landing · Onboarding (who / what brings you / privacy & consent / name / next visit) · Home · Tell my story (opening + 5 steps) · See it in doctor terms (edit wording) · Saved · My case (+ add evidence) · One-page brief · Show in the room (doctor view) · Morning-of prep · Breathing · Post-visit check-in · Escalation scripts · Follow-up "did it happen?" · Scripts (+ practice) · Peer playbooks (+ share what helped) · Visits · Settings (text size, download data, delete everything) · Crisis help · Caregiver placeholder.

## Next steps (per PRD / ADR-001)

- Express API + Claude for the follow-up questions, the SOCRATES summary, the after-visit summary and the lab/note explainer. Swap `translateStory()` for the API call, and keep the rule-based version as the fallback.
- Supabase auth + storage (RLS, hard delete), then real share links and push reminders.
- After-visit summary and action items from the saved visit transcript (F5/F8), plus the lab/note explainer (F9).
- Clinical and PM review of the script and playbook copy (`src/data/`).
