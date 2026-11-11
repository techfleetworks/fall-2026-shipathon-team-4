# Appointment Ready API: guide for frontend

**Owner:** Yadira (backend / full-stack) · **For:** Diana (frontend) · **Last updated:** Nov 11, 2026

The backend is an Express server (`server/app.ts`) that runs on Vercel as a serverless function, on the **same
address as the app**. So from any screen, call `/api/...`. No CORS, no keys, no full URLs.

You normally don't call `fetch` yourself: use the ready-made functions in `src/lib/api.ts` and
`src/lib/useServerSummary.ts`. They never throw; every result has a `status` you can `switch` on.

---

## Run it locally

```bash
npm run dev       # the app, http://localhost:5173
npm run dev:api   # the server, http://localhost:3001 (second terminal)
```

The app's dev server forwards `/api` to port 3001. If `dev:api` isn't running, API calls return
`unavailable`, which is expected, so start it.

```bash
npm test          # all tests (unit, API, Gherkin). CI runs these on every PR.
```

---

## Sign-up, log-in and the token (Supabase)

Accounts live on the Supabase sign-in server once it's set up (`docs/SUPABASE_SETUP.md`, ADR-005).
Screens call `src/lib/auth.ts`, never Supabase directly:

| Function | Use |
|---|---|
| `isServerAuthEnabled()` | `false` until Supabase is configured; then the on-device fallback is skipped |
| `signUp({ email, password, firstName, lastName })` | `ok` · `confirm-email` (show the message) · `error` (show the message) |
| `logIn({ email, password })` | same statuses |
| `logOut()` | ends the server session (Settings → Log out already calls it) |
| `deleteServerAccount()` | deletes the account on the server; wipe the device only if `ok` (Settings already does this) |

You don't add tokens yourself: every function in `src/lib/api.ts` sends the signed-in user's token. If the server
answers 401 you get `status: 'rejected'` with code `UNAUTHORIZED` and the message "Your sign-in has expired.
Please log in again.", so send the person to `/login`.

## 1. Story → doctor terms: `POST /api/prep-summary`

Runs the doctor-terms engine **with the guardrails** (no diagnosis, no advice, no dosing, approved terms only,
crisis first) on the server.

### Easiest: the live-preview hook (already used in `visit/Before.tsx`)

```tsx
import { applyOverrides, useServerSummary } from '../../lib/useServerSummary';

const preview = useServerSummary(draft);                         // asks the server ~0.5 s after typing stops
const fields = applyOverrides(preview.fields, draft.overrides);  // patient's own rewrites always win
```

| `preview.status` | What it means | What the screen shows |
|---|---|---|
| `waiting` / `loading` | Not asked yet, or asking | Keep the current lines; optional "Updating…" |
| `ok` | `preview.fields` are the server's lines | Show them |
| `blocked` | A guardrail was broken; nothing to show | `preview.message` (honest fallback) |
| `unavailable` | Server couldn't be reached | `preview.message`; don't show stale lines as final |
| `crisis` | Crisis language in the story; nothing was sent | Go to crisis support (see **Crisis rules**) |

An empty story (nothing typed or picked) isn't sent; you get the placeholder lines.

### When saving: call it once more, directly

```ts
import { requestPrepSummary } from '../../lib/api';

const { overrides, ...story } = useDraft.getState().draft;
const out = await requestPrepSummary(story);
switch (out.status) {
  case 'ok':          saveSummary({ opening: story.opening.trim(), fields: applyOverrides(out.fields, overrides) }); break;
  case 'crisis':      /* go to crisis support, clear the crisis text */ break;
  case 'blocked':     /* show out.message, don't save */ break;
  case 'rejected':    /* out.error.code === 'EMPTY_STORY' → nothing to save; else show out.error.message */ break;
  case 'unavailable': /* show out.message + a Try again */ break;
}
```

### Raw HTTP (for reference)

Request body: `{ "draft": StoryDraft }`. Only the known fields are read. Chip answers must be the app's own
choices (`ONSET_CHOICES` etc. in `translate.ts`), `severity.score` is 0–10, and text fields are capped
(5,000 characters; medication fields 200; each override 1,000).

| Response | Body |
|---|---|
| `200` | `{ "status": "ok", "fields": SummaryField[], "disclaimer": "Not a diagnosis or medical advice — a tool to help you be heard." }` |
| `200` | `{ "status": "crisis", "help": { "message", "resources" } }`: the engine never ran |
| `200` | `{ "status": "blocked", "message", "rules": ["no-diagnosis", ...] }` |
| `400` | `{ "status": "error", "error": { "code": "INVALID_STORY" \| "EMPTY_STORY", "message" } }` |
| `415` | Body wasn't JSON |

---

## 2. Visit transcript: `POST /api/transcripts`

Cleans a pasted or uploaded transcript, checks it for crisis language, and splits it into speaker turns.
**Stores nothing.** The screen for it is **not designed yet**: you decide where paste/upload lives in the flow.
One natural fit is the Recap ("What the doctor said"): the clinician's turns can fill `recap.doctorSaid`.

```ts
import { submitTranscriptToServer } from '../../lib/api';
import { decodeTranscriptFile } from '../../lib/transcript/intake';  // for .txt uploads: checks type, size, real text

const out = await submitTranscriptToServer(text, 'paste');   // or 'upload' / 'sample'
switch (out.status) {
  case 'accepted':    out.payload; break;   // see below
  case 'crisis':      /* crisis support */ break;
  case 'rejected':    /* out.error.message: empty, too long, etc. */ break;
  case 'unavailable': /* out.message + Try again */ break;
}
```

`out.payload` (the `TranscriptPayload` in `src/lib/transcript/types.ts`):

```jsonc
{
  "schemaVersion": 1,
  "id": "uuid", "receivedAt": "ISO time", "source": "paste",
  "stats": { "characters": 1036, "words": 183, "lines": 10, "dialogueTurns": 7 },
  "speakers": ["Theo", "Dr. Lane"],                 // names that speak at least twice
  "turns": [{ "speaker": "Dr. Lane", "text": "Let's give it time." }, { "speaker": null, "text": "header line" }],
  "transcript": "cleaned full text",
  "disclaimer": "Synthetic — illustrative only, not medical advice."
}
```

- **Demo:** `THEO_SAMPLE_TRANSCRIPT` in `src/data/sampleTranscript.ts` is the Starter Pack transcript, verbatim.
- **Uploads:** read the file in the browser (`decodeTranscriptFile(name, bytes)`, `.txt` only, ≤ 512 KB), then send the text.
- **Storage rule (ADR-001 Decision 5):** raw transcripts are **session-only**. Keep the text in memory or
  `sessionStorage`; only an approved summary (e.g. the recap lines the patient confirms) is saved for good.

Limits: 200,000 characters; request body 1 MB (`413` if bigger).

---

## 2b. Transcript → recap: `POST /api/visit-summary` (new)

Turns a transcript into **"What the doctor said"** lines for the Recap (`recap.doctorSaid`). Rule-based for now:
the clinician's own lines, in their words (Claude can rewrite them in plain words later, behind the same endpoint).

```ts
import { requestVisitSummary } from '../../lib/api';
const out = await requestVisitSummary(text, 'paste', { patientName: profile?.name });
// out.status: 'ok' → out.doctorSaid: string[], out.clinicians: string[] | 'crisis' | 'rejected' | 'unavailable'
```

Body: `{ transcript, source?, patientName? }` (`patientName` ≤ 80 characters; it's how the server tells the patient's
lines from the clinician's. Without it, speakers named "Dr. …", "Nurse …" etc. count as clinicians.)
`200 { status: "ok", doctorSaid, clinicians, dialogueTurns, disclaimer }` · `200 { status: "crisis", help }` · `400` · `415`.
Store the lines with `source: 'transcript'` (the Recap pill then reads "★ From your transcript").

## Drop-in pieces (ready to place anywhere)

See them all on **`/demo/pieces`** (signed in, demo data). Not linked from the navigation; delete it once the
pieces are placed.

| Piece | One line to add it | What it does |
|---|---|---|
| `TranscriptImport` (`src/components/transcript/`) | `<TranscriptImport patientName={profile?.name} demo={demoMode} onUse={(lines) => …} />` | Paste / .txt upload / Theo sample → crisis check on the device → `/api/visit-summary` → the patient reviews the doctor's lines → `onUse(lines)`. The transcript is kept in memory only. |
| `DisclaimerNote` (`src/components/guardrails/`) | `<DisclaimerNote kind="notMedicalAdvice" />` | One line of small print (`note` class). Default `kind` is `short`. |
| `DisclaimerCard` | `<DisclaimerCard kind="notForEmergencies" />` | The same line as a calm card (`pcard pcard--muted`). |

`aiCanBeWrong` renders nothing until `AI_IN_USE` (in `src/lib/guardrails/copy.ts`) is set to `true`, in the
same change that wires Claude in.

## 3. `GET /api/health`

`{ "status": "ok", "service": "appointment-ready-api", "time": "..." }`. Use it to check the server is up.

---

## Crisis rules every screen must keep

Team rule: *if someone types self-harm or suicidal intent, surface 988/crisis support directly (not just the
footer), never fold it into a brief, and use a gentle handoff with no active-rescue or police framing.*

1. **Check on the device first, then send.** `storyDraftHasCrisis(draft)` (story) or `hasCrisisLanguage(text)`
   (anything else). If it's true, don't call the server: go to `/help/now`. This keeps crisis text from ever leaving the device.
2. **Check on every path that moves forward**: Next, **Skip**, Save, Done, and back-navigation into a summary.
   (The Skip gap in the story screen is fixed in `visit/Before.tsx`.)
3. **Check the whole story, not just the visible question**: `storyDraftHasCrisis()` covers every answer and every override.
4. **Clear the crisis text** before leaving (`withoutCrisisText()` in `Before.tsx`) so it's never saved.
5. **The server checks again** and answers `crisis`. Treat that the same as rule 1.

Shared content for the Help screen (use it, or keep your own wording) lives in `src/lib/guardrails/copy.ts`:
`HELP_HEADING`, `HELP_RESOURCES` (warmline → 988 → 911), `CRISIS_DETECTED_RESOURCES` (988 first),
`CRISIS_HANDOFF`, `HELP_PAGE_FOOTER` (Trans Lifeline · Wildflower Alliance · warmline.org).

## Disclaimers (copy is ready; placement is yours)

`DISCLAIMERS` in `src/lib/guardrails/copy.ts`, with "Appointment Ready" filled in from `src/lib/brand.ts`:
`notMedicalAdvice`, `short` (already used by `<Disclaimer />`), `notForEmergencies`, `onboarding`,
`aiCanBeWrong`. Use `disclaimerText('notForEmergencies')` for plain text.
**Don't show `aiCanBeWrong` yet**: there's no AI in the app until Claude is added.

## What's coming next (heads-up)

- `/api/visit-summary` (transcript → after-visit summary) and other Claude endpoints, with the same `status` pattern.
- Sign-in (Supabase): every `/api` call will then need the user's session token (we'll add it in `api.ts`, so screens won't change).
- Questions or a new endpoint you need? Tell Yadira what the screen needs to send and show.
