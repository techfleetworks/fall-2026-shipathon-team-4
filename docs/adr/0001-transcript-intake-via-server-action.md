---
status: proposed
date: 2026-11-04
deciders: Team 4 backend/full-stack (author); pending review by frontend teammate
---

# ADR-0001: Accept transcripts through a Next.js Server Action, with a framework-free core

## Context and problem statement

The patient-advocacy app's first backend task is to accept a visit transcript (pasted text or an uploaded
file), check it is not empty, and return a structured JSON payload with metadata and a mandatory safety
disclaimer: `Synthetic - illustrative only, not medical advice`. The app is a Next.js App Router project
deployed on Vercel. There are no user accounts yet, no database, and only synthetic data is allowed.

How should the server receive the transcript, and where should the validation rules live?

## Decision drivers

- The frontend teammate needs a simple contract to build the UI against.
- The input is untrusted and may contain health-like details, so validation must run on the server.
- Rules (limits, disclaimer text) must not drift between client hints and server checks.
- Hackathon pace: minimal dependencies, easy to test.

## Considered options

1. **Server Action** (`app/actions/transcript.ts`) called from a `<form action>` with `useActionState`.
2. **Route Handler** (`app/api/transcripts/route.ts`) taking `POST` JSON or multipart data.
3. Client-only parsing with no server step.

## Decision outcome

Chosen: **option 1, a Server Action**, wrapping a **pure core module** (`lib/transcript/intake.ts`) that has no
Next.js imports.

- The form gets progressive enhancement (it works before JavaScript loads) and typed results with no fetch code.
- The pure core can later back a Route Handler unchanged if an external client (mobile app, webhook) needs an
  HTTP API, so option 2 stays cheap to add.
- Option 3 was rejected: a browser-only check can be skipped, and later steps (AI analysis) need server access anyway.

### Consequences

- Good: one source of truth for limits and the disclaimer (`lib/transcript/constants.ts`), shared by client and server.
- Good: the core is unit-tested and the action is tested by calling it directly, the way an attacker would.
- Bad: a Server Action is not a stable public API (its ID changes per build). External callers need a Route Handler.
- Bad: no rate limiting or authentication yet (see risks).

## Security decision record (OWASP threat modeling)

**Surface:** one public POST entry point (the Server Action). Untrusted inputs are the `transcriptText` string and
the `transcriptFile` file. Nothing is stored and nothing is logged except an error type.

| Threat (STRIDE) | Rank | Cheat sheet | Response and control | Executable check |
|---|---|---|---|---|
| Direct call bypassing the page with malformed fields (Tampering) | High | Nextjs_Security (3) | Mitigate: every field type-checked on the server | `@usecase:server-action-direct-call` |
| Malicious or binary upload (Tampering) | High | File_Upload (2, 4, 5) | Mitigate: `.txt` allow-list, MIME ignored, strict UTF-8 decode, NUL rejected, never stored | `@usecase:upload-wrong-type`, `@usecase:upload-binary-disguised` |
| Huge payload (Denial of service) | High | Denial_of_Service, File_Upload (12) | Mitigate: 1 MB body cap in `next.config.ts`, 512 KB file cap checked before reading, 200,000-character text cap | `@usecase:upload-oversized`, `@usecase:too-long` |
| Health details leaking via errors or logs (Information disclosure) | High | Error_Handling, Logging | Mitigate: fixed error messages, log the error type only | `@usecase:error-no-leak`, unit test on `console.error` |
| Control characters / terminal escapes in text (Tampering) | Medium | Input_Validation | Mitigate: stripped during cleanup | `@usecase:control-characters` |
| Script injection when the JSON is shown (Tampering) | Medium | Cross_Site_Scripting_Prevention | Mitigate: rendered as React text (auto-escaped), never as HTML | Not yet automated (needs a browser test) |
| Flooding with requests (Denial of service) | Medium | Denial_of_Service | **Accept for the prototype**: no rate limit. Revisit before any public launch (Vercel WAF or a rate-limit store) | None |
| Spoofing / no identity | Low now | Authentication | **Accept for the prototype**: no accounts and no stored data. Add server-side auth when data is saved | None |

**Real guarantee vs. tests:** the structural controls are the server-side type and size checks in
`app/actions/transcript.ts` and the strict UTF-8 decoder in `lib/transcript/intake.ts`. The scenarios prove
specific attacks are blocked; they do not prove no other attack exists.

## Data handling

- Synthetic transcripts only; the form says so. Real patient data is out of scope until a compliance review.
- No persistence, so there is no retention or deletion work yet. When storage is added, write a new ADR covering
  retention, deletion, and audit logging.

## More information

- Code: `lib/transcript/`, `app/actions/transcript.ts`, `components/transcript/TranscriptForm.tsx`
- Tests: `lib/transcript/intake.test.ts`, `app/actions/transcript.test.ts`, `features/transcript-intake.feature`
- OWASP Next.js Security, File Upload, Denial of Service, Error Handling, Logging, Input Validation cheat sheets,
  read via the Tech Fleet `owasp-secure-coding-bdd` skill on 2026-11-04.
