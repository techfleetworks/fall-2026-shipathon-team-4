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
| `200` | `{ "status": "ok", "fields": SummaryField[], "disclaimer": "Not a diagnosis or medical advice — a tool to help you be heard.", "engine": "rules" \| "claude" }` |
| `200` | `{ "status": "crisis", "help": { "message", "resources" } }`: the engine never ran |
| `200` | `{ "status": "blocked", "message", "rules": ["no-diagnosis", ...] }` |
| `400` | `{ "status": "error", "error": { "code": "INVALID_STORY" \| "EMPTY_STORY", "message" } }` |
| `415` | Body wasn't JSON |

**Which engine answers (ADR-006).** By default the free rule-based engine. The server can optionally add
Claude (`MAPPING_ENGINE=claude` plus `ANTHROPIC_API_KEY`, server env only). Claude can then only *add* approved terms the word
list missed, each backed by the patient's exact words. If anything goes wrong (slow, down, an invented term), the
answer quietly comes from the rules engine. **Nothing changes for the screens**: same statuses, same fields.
`engine` is informational, and `GET /api/health` shows `mappingEngine`. Quality check: `npm run eval:mapping`.

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

## 2c. Clinical → plain: `POST /api/explain` (new, ADR-007)

Explains clinical words and note shorthand in plain language, from a reviewed glossary (no AI, free).
Works on a clinical note, what the doctor said, or the app's own doctor-terms lines.

```ts
import { requestExplanation } from '../../lib/api';

const out = await requestExplanation('?orthostatic hypotension, RV in 4/52');
if (out.status === 'ok') out.explanations; // [{ found: '?', plain: 'Query (or a "?" …)…' }, { found: 'orthostatic hypotension', plain: 'Blood pressure that drops…' }, …]
```

Each explanation is `{ id, term, kind: 'term' | 'shorthand', found, plain }`, in reading order. An empty list
means there was nothing to explain. Other statuses: `crisis` (go to crisis support), `blocked` (show `message`),
`rejected` (`EMPTY_TEXT`, `TEXT_TOO_LONG` over 20,000 characters, `INVALID_TEXT`), `unavailable`.
No server needed for tooltips: `explainClinical(text)` from `src/lib/explain/explain.ts` gives the same answer on the device.
Placement is yours, e.g. a "What this means" link under each doctor-terms line.

## 2d. Labs & notes → plain: `POST /api/explain-results` (new, ADR-008)

Lab results placed against the range printed on the report, plus the clinical-note terms (§2c), in one call. Free, no AI.

```ts
import { requestResultsExplanation } from '../../lib/api';
import { THEO_CLINICAL_NOTE, THEO_LABS } from '../../data/sampleResults';   // demo data (synthetic)

const out = await requestResultsExplanation({ labs: [...THEO_LABS], note: THEO_CLINICAL_NOTE });
if (out.status === 'ok') {
  out.labs;      // [{ test, value, typicalRange?, position: 'above'|'within'|'below'|'change'|'no-range'|'not-compared', summary, about? }]
  out.note;      // same shape as /api/explain
  out.labsNote;  // "Typical ranges differ between labs…": show once near the labs
}
```

Example: `{ test: 'Fasting glucose', value: '104 mg/dL', position: 'above', summary: '104 mg/dL is above the typical range shown (70-99).', about: 'Blood sugar measured after not eating, usually overnight.' }`.
It never says what a result means for the person, by design. Other statuses: `crisis`, `blocked`, `rejected`
(`EMPTY_RESULTS`, `INVALID_RESULTS`, `TEXT_TOO_LONG`), `unavailable`. For a CSV upload, `parseLabsCsv(text)` from
`src/lib/labs/labs.ts` turns a labs.csv-style file into rows (other columns are ignored).

## 2e. Share the one-page brief with the care team (new, ADR-009)

One expiring link **per person** (PCP, therapist, psychiatrist…). The doctor opens it on any device without signing in.
The patient can stop one person without affecting the others. Needs sign-in and the Supabase step in
`docs/SUPABASE_SETUP.md` §8.

```ts
import { createShare, listShares, shareStatus, stopShare, stopAllShares } from '../../lib/sharesApi';
import { shareEmailDraft } from '../../lib/shareEmail';
import { buildBriefSnapshot } from '../../lib/brief';

const out = await createShare({
  brief: buildBriefSnapshot(state, visit, { talkingPoints, summary }),
  recipient: { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example', clinic: 'Riverside Clinic' },
  days: 7,                                     // 1–30 (your 24 h / 7 days / 30 days picker)
});
if (out.status === 'ok') {
  const email = shareEmailDraft({ recipient: out.share.recipient, url: out.url, expiresAt: out.share.expiresAt, patientName: profile.name });
  window.location.href = email.mailto;          // opens the patient's own email app, ready to send
  // out.url is shown ONCE (only a hash is stored): offer "Copy link" too. out.trimmed → "Shortened to fit one page."
}
// 'crisis' → crisis support (nothing shared) · 'rejected' → out.error.message · 'unavailable' → try again

const list = await listShares();               // "Shared with": one row per person
list.status === 'ok' && list.shares.map((s) => [s.recipient.name, s.recipient.role, shareStatus(s)]);  // active | expired | stopped
await stopShare(id);                           // stop ONE person
await stopAllShares();                         // stop everyone
```

Roles: `Primary care`, `Therapist`, `Psychiatrist`, `Specialist`, `Other`. The **email holds only the link and its end date**,
never health details. `/shared/:token` already asks the server for links made on other devices, and an open doctor page clears **within about a
second** when the patient stops sharing (Supabase Realtime signal; 30-second re-check as backup). Nothing to build on your side.

**For your screens (from the team notes):**
- A "Shared with" list, one row per person with its own **Stop sharing** button. **Stop all** is optional.
- Care-team fields: name, role, work email, hospital/clinic.
- Deleting the account stops every share (the database deletes them). Say so in the delete dialog, and consider
  the **type DELETE to confirm** pattern there.

## 2f. Theo's demo from the server: `GET /api/demo` (new, ADR-010)

"Explore with demo data" (Landing and Settings) now calls `startDemo(loadDemo)` from `src/lib/demoApi.ts`. It loads Theo from
the server and falls back to the built-in `buildDemoState()` if the server doesn't answer within 3 seconds. **Nothing to change on
your side.** Your demo content is the source: after you edit `src/data/demo.ts`, a backend dev runs `npm run seed:theo`.
Theo's past visit now has `recap.source: 'transcript'` with Dr. Lane's lines, which your Recap shows as "From your transcript".
The response includes `label: "Synthetic — illustrative only, not medical advice."`

**Logging in as Theo** (`theo.demo@example.com`; the password is in the team's `.env.local`) loads his record via `GET /api/me/app-data`
(already wired in `Auth.tsx`). Logging out in demo mode clears Theo from the device. For the shared account, "Delete account" and creating
doctor links are refused (403 `DEMO_ACCOUNT_READ_ONLY`, with a friendly message), so you may want to hide those buttons when `demoMode` is on.

## 2g. Plain-language after-visit summary (new, ADR-011)

Theo's past visit now has `visit.afterVisit` (and your Recap already shows its plain "What the doctor said" lines, plus ✓ on
talking points that came up):

```ts
visit.afterVisit = {
  youRaised:  ['You talked about feeling very sleepy in the day.', …],
  doctorSaid: ['The doctor thinks this is from the depression.', …],   // same as visit.recap.doctorSaid
  plan:       ['Wait and see for now.', 'No change for now.', 'Check again next month.'],
  notCovered: ['The doctor did not talk about feeling dizzy when you stand up.'],
  talkingPoints: [{ text, raised }], readingGrade: 3.4, meetsReadingTarget: true,
}
```

**Not shown yet, your call where:** `plan` (it fits the After → Next steps step) and `notCovered` (e.g. "Not covered at this visit"
under the Recap; it's the strongest line for the next visit). For a visit with only quick notes, `summarizeNotes(visit.notes)` from
`src/lib/afterVisit/summary.ts` gives the same shape on the device. `POST /api/visit-summary` also returns `summary` (send
`talkingPoints` to get `raised`), ready for when recording and transcription exist.

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
