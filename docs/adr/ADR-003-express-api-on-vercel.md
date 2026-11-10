---
status: proposed
date: 2026-11-09
deciders: Team 4 backend/full-stack (author); review by Diana (frontend)
---

# ADR-003: Express API in the same repo, deployed as a Vercel function

## Context

Get Heard has been browser-only (ADR-001 MVP). The README's next steps call for an Express API + Claude
(follow-up questions, SOCRATES summary, after-visit summary, lab/note explainer), then Supabase. The repo is
already deployed on Vercel. The first backend need is server-side transcript intake (ADR-002), so later AI
features receive input that has already been validated and crisis-checked.

## Decision

- **Express 5**, as ADR-001 names, with the app in `server/app.ts` (`createApp()`).
- **Deployed on Vercel as one serverless function**: `api/index.ts` exports the app, and `vercel.json` rewrites
  `/api/*` to it. Same domain as the web app, so no CORS and no second service to sign up for. PR previews include the API.
- **Local development**: `npm run dev:api` runs the same app on port 3001; Vite forwards `/api` to it.
- **Shared code**: the server imports `src/lib/transcript/intake.ts` directly, so browser and server run the
  same checks. Imports in that chain use `.js` extensions so Node's ES module loader resolves them on Vercel.
- **Separate type check** (`tsconfig.server.json`, Node types, no DOM) runs as part of `npm run build`, so a
  server type error blocks the deploy.

### Endpoints (v1)

| Method and path | Result |
|---|---|
| `GET /api/health` | `200 { status: "ok", service, time }` |
| `POST /api/transcripts` with `{ transcript, source? }` | `201 accepted + payload` · `200 crisis + 988 help, no payload` · `400 error` · `413` over 1 MB · `415` not JSON |
| Anything else under `/api` | JSON `404` or `405` |

## Considered options

1. **Vercel function in this repo** (chosen): no new accounts; one deploy; scales to zero.
2. **Separate always-on server** (Render, Railway): a classic long-running process, but a new account, a second
   URL, CORS, and a server that costs money while idle. Worth revisiting if we need WebSockets or long jobs.
3. **Next.js Route Handlers**: rejected, since the app is Vite (see the closed PR #2).

## Consequences

- Good: the AI endpoints can be added as new routes in `server/app.ts` with the Anthropic key stored as a Vercel
  environment variable, never in the browser.
- Bad: serverless functions have time limits and cold starts. Fine for validation; streaming AI responses
  may need Vercel's longer-duration settings.
- Bad: **no authentication and no rate limiting yet**. The API is public and stateless (stores nothing), so the
  risk is limited to abuse of compute. Add rate limiting (Vercel WAF or a store-backed limiter) before the AI
  endpoints ship, since those cost money per call.
- The web app does not call the API yet; it still runs intake on the device (local-first). Switching it is a
  separate product decision: it means transcript text leaves the device.

## Security decision record

| Threat | Rank | Response | Executable check |
|---|---|---|---|
| Crisis text processed by the API | Critical | Eliminate: shared crisis check runs first; response carries 988 help and no payload | `@usecase:api-crisis-fixture`, unit test |
| Oversized or non-JSON bodies | High | Mitigate: 1 MB parser limit, JSON-only, strict parsing | `@usecase:api-oversized`, `@usecase:api-not-json` |
| Transcript leaking via errors or logs | High | Mitigate: fixed messages; error handler logs only the error type; bodies never logged | `@usecase:api-malformed-json`, unit test on console |
| Responses cached by browsers or proxies | Medium | Mitigate: `Cache-Control: no-store` on every response | `@usecase:api-headers` |
| MIME sniffing, framework fingerprinting | Low | Mitigate: `nosniff`, `x-powered-by` disabled | `@usecase:api-headers` |
| Request flooding | Medium | **Accept for now** (stateless, stores nothing); revisit before AI endpoints | None |
| No identity / authorization | Medium | **Accept for now** (no user data stored); add with Supabase auth | None |
