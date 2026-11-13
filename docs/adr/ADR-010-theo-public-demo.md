---
status: proposed
date: 2026-11-13
deciders: Team 4 backend (author); review by Diana (frontend), Dominic (Product)
---

# ADR-010: Theo as a real backend user, served as the public demo

## Context

Board card: "Theo (persona) set up as a real backend user so the demo can show live data. Set up Theo as a
backend user tied to front-end data." Product decision: build and demo on synthetic data only (Starter Pack).
Use the files as-is, Theo only, and label everything "Synthetic — illustrative only, not medical advice." The
plan for visitors: anyone can explore the demo to see how the app works, then sign up and use it with their own
appointments.

Before this, "Explore with demo data" built Theo **in the browser** (`buildDemoState()` in `src/data/demo.ts`), so the
team couldn't update him in one place, and his last visit's Recap said "Nothing yet" even though `transcript.txt` exists.

## Decision

1. **Theo is a real Supabase account** (`theo.demo@example.com`) created by `npm run seed:theo` with **no password**
   and `app_metadata.role = public-demo`. Nobody can sign in as Theo.
2. **One table for app data, `app_state`** (migration `20261113000000_app_state.sql`): one JSON record per user, in the shape
   the screens already use (`AppData`). Today it holds only Theo, marked `is_public_demo` (a unique index allows at most one).
   RLS: read own record only. There are **no write policies**, so only the server key writes, and nobody can make their own record
   the public demo. Real users' records come with the Visit store card, which adds write policies (with `is_public_demo = false`).
3. **Theo's record = existing content, unchanged** (`server/demo/theoRecord.ts`): Diana's `buildDemoState()` as-is (the team
   chose to keep its wording, e.g. "dose increased"), his last name from `personas.json`, and his past visit's Recap from
   `transcript.txt` (Dr. Lane's lines, `source: 'transcript'`, which Diana's Recap already shows as "From your transcript").
   **Labs and the clinical note are not included yet**, pending the team's decision on their screens.
4. **`GET /api/demo`**: public and read-only (405 for writes). It returns only an allow-list of fields; the profile keeps display
   fields only (never email, password hash, share links or settings). Dates and timestamps are shifted by `today − anchor_date`,
   so "next visit in 20 days" stays true. 404 `DEMO_NOT_SET_UP` when there's no record; 500 on a database error.
5. **Explore button** (`src/lib/demoApi.ts → startDemo`): asks the server first, and uses the built-in copy if the server doesn't
   answer within 3 seconds or Theo isn't set up, so the demo always runs. A visitor's changes stay on their device: demo data is
   never written back.

## Consequences

- Good: the team updates Theo in one place (edit `demo.ts` or the record builder, then `npm run seed:theo`). The demo shows live server
  data, and the Recap shows the transcript instead of "Nothing yet".
- Good: `app_state` is the start of the mentor's "sync when back online" point and of the Visit store card.
- Bad: Theo's data is a single JSON record, not separate tables. That's fine for one demo user, and the Visit store card decides the long-term shape.
- Neutral: the seed script needs the server key (`.env.local`), so only a developer can run it.

## Verification

`server/demo.test.ts`, `src/lib/demoApi.test.ts`, `features/public-demo.feature` (5 scenarios). Mutation-checked: leaking profile fields,
returning every field, stale dates, a time-zone day slip, a recap on the future visit, and a demo that can hang each fail a test.
Checked live on 2026-11-13: seed created Theo (2 visits, 1 transcript recap); a fresh visitor's Explore click loaded him from
`GET /api/demo` (200); Diana's Recap showed Dr. Lane's three lines "From your transcript".
