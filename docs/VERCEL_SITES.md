# Two live sites, two Supabase projects, one codebase (ADR-016)

| | Real users' site | Demo site |
|---|---|---|
| Address | `fall-2026-shipathon-team-4.vercel.app` | `fall-2026-shipathon-team-4-rosy.vercel.app` |
| Vercel project | Yadira's | Diana's |
| Supabase project | **Appointment Ready** (real users) | **Appointment Ready DEMO** (only Theo) |
| Code | this repository's `main` | the **same** `main` |

**One codebase:** a merge to `main` updates both sites. **Two Supabase projects:** each has its own sign-in rules and data, and Theo's
public password can't reach the project that holds real people's accounts.

## Vercel settings (Project → Settings → Environment Variables, Production + Preview, then Redeploy)

| Setting | Real users' site | Demo site |
|---|---|---|
| `VITE_SITE_MODE` | `live` | `demo` |
| `VITE_DEMO_URL` | `https://fall-2026-shipathon-team-4-rosy.vercel.app` | *(leave out)* |
| `VITE_LIVE_URL` | *(leave out)* | `https://fall-2026-shipathon-team-4.vercel.app` |
| `VITE_DEMO_LOGIN_EMAIL` | *(leave out)* | `theo.demo@example.com` |
| `VITE_DEMO_LOGIN_PASSWORD` | *(leave out; never shown on this site)* | Theo's password (`THEO_DEMO_PASSWORD` in `.env.demo-server.local`). **Shown on the demo page on purpose** |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | **real** project URL | **DEMO** project URL |
| `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` | **real** publishable key | **DEMO** publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **real** secret key | **DEMO** secret key. Add it together with Diana; never in chat |
| `REQUIRE_AUTH` | `true` | `true` |

## Supabase settings (Authentication → Sign In / Providers)

| | Real users (Appointment Ready) | DEMO |
|---|---|---|
| Allow new users to sign up | **On** | **Off** (only Theo) |
| Confirm email | **On before real users** (and set up an email sender: Supabase's built-in one sends only a few emails per hour) | Off |

## On your computer
| File (git-ignored) | Project | Commands that use it |
|---|---|---|
| `.env.local` | real | `npm run dev:api:supabase` (Theo is **not** in the real project) |
| `.env.demo-server.local` | DEMO | `npm run dev:api:demo`, **`npm run seed:theo`** (same as `seed:theo:demo`: both only ever write to the DEMO project) |

## Rule for database changes
A new file in `supabase/migrations/` is run **in both projects** (SQL Editor → paste → Run). After a change to Theo's data, run
`npm run seed:theo:demo`.

## Check after setting it up
- Real users' site: the start page shows **"Explore the demo (Theo, synthetic) ↗"** and opens the demo site; sign-up works.
- Demo site: the start page shows **"Try it as Theo"** → **Log in as Theo** → **"Hi Theo!"**; `/signup` shows "This is the demo, with Theo".
