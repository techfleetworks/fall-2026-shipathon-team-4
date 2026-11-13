---
status: proposed
date: 2026-11-13
deciders: Team 4 backend/full stack (Yadira); demo site owner Diana; team choice "option A" (show Theo's login publicly)
---

# ADR-016: One codebase, two live sites (real users + Theo demo)

## Context

The team runs two live Vercel sites from this repository:
- **Real users** (`fall-2026-shipathon-team-4.vercel.app`, Yadira's project): the working app with server sign-in and data.
- **Demo** (`fall-2026-shipathon-team-4-rosy.vercel.app`, Diana's project): Theo, the synthetic persona, with log in and log out, so
  people can see how the app works with real-looking information.

Checked on Nov 13: the real users' site has Supabase sign-in; the demo site has **no Supabase settings**, so its log-in is on-device only and
Theo's server account can't be reached there. Both sites showed "Explore with demo data", which on the real users' site would **replace a real
user's own data** on that device with Theo's.

## Decision

- A build-time **site setting** (`src/lib/siteMode.ts`): `VITE_SITE_MODE=live|demo` (default `live`), plus `VITE_DEMO_URL` (real users' site)
  and `VITE_DEMO_LOGIN_EMAIL` / `VITE_DEMO_LOGIN_PASSWORD` (demo site). Same code; each Vercel project sets its own values (`docs/VERCEL_SITES.md`).
- **Real users' site:** "Explore the demo" (start page) and "Open the demo" (Settings) **link to the demo site in a new tab**
  (`rel="noopener noreferrer"`). The in-place demo that replaces data is not offered there. Only `https://` links (or localhost while developing)
  are accepted. A demo password is never shown on this site, even if set by mistake.
- **Demo site (team option A):** the start page shows **"Try it as Theo"** with his email and password and a **Log in as Theo** link that fills
  in the login form (`/login?as=theo`). The demo site needs the same Supabase settings as the real users' site, since Theo lives in that project.
- **No duplicate work:** code, Theo's data (`npm run seed:theo`) and database migrations are done once. Only Vercel settings are per site.

## Update (Nov 13): two Supabase projects

The team wants the sites to differ in sign-in rules (e.g. confirm email for real users only). Those are Supabase **project** settings, so the
demo got its own Supabase project, **Appointment Ready DEMO**, holding only Theo, with sign-ups off and confirm email off. The same 3 migrations
were run there, and `npm run seed:theo:demo` (keys in the git-ignored `.env.demo-server.local`) created Theo. Theo's public password now can't reach
the real users' project at all. On the demo site, `/signup` shows a notice that links to the real site (`VITE_LIVE_URL`) or offers Theo's login.
Verified locally: the demo site logged in as Theo with a session from the DEMO project; the real project was not touched.

## Consequences

- Real users' data is never at risk from the demo, because the demo runs on another site (separate browser storage).
- Theo's password is public. That's acceptable because the account is protected (no delete, no share links; ADR-010) and `npm run seed:theo` resets it.
- **Action needed:** Diana's Vercel project needs the demo settings and the Supabase settings, added together with Yadira (the secret key stays out of chat).
- Remaining: "Explore with demo data" (no login) on the demo site uses the server only for Theo's data and "Play Theo's visit". Other server features
  need the Theo login when the demo site requires sign-in.

## Verification

`src/lib/siteMode.test.ts` (live by default; https-only demo link; demo login only in demo mode; never on the live site). Mutation-checked: accepting any
link, demo by default, and a password on the live site each fail a test. Checked locally with two sites side by side: the real users' site showed
"Explore the demo ↗" linking to the demo site in a new tab (no in-place button, no password); the demo site showed "Try it as Theo" → the form filled in
→ logged in → "Hi Theo!" with his server data.
