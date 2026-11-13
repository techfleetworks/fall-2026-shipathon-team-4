# Two live sites, one codebase (ADR-016)

Both Vercel projects build from **this repository's `main` branch**. Code changes reach both sites with one merge. What differs is
each project's **Environment Variables** (Vercel → Project → Settings → Environment Variables, for Production and Preview).
**After changing any `VITE_` value, redeploy** (Deployments → ⋯ → Redeploy): those values are built into the page.

| Setting | Real users' site<br>`fall-2026-shipathon-team-4.vercel.app` (Yadira's project) | Demo site<br>`fall-2026-shipathon-team-4-rosy.vercel.app` (Diana's project) |
|---|---|---|
| `VITE_SITE_MODE` | `live` | `demo` |
| `VITE_DEMO_URL` | `https://fall-2026-shipathon-team-4-rosy.vercel.app` | *(leave out)* |
| `VITE_DEMO_LOGIN_EMAIL` | *(leave out)* | `theo.demo@example.com` |
| `VITE_DEMO_LOGIN_PASSWORD` | *(leave out; never shown on this site even if set)* | Theo's password (the same as `THEO_DEMO_PASSWORD` in your `.env.local`). **Shown on the demo page on purpose** |
| `VITE_SUPABASE_URL` | Project URL | **the same** Project URL (Theo lives in this Supabase project) |
| `VITE_SUPABASE_ANON_KEY` | publishable key | **the same** publishable key |
| `SUPABASE_URL` | Project URL | **the same** |
| `SUPABASE_ANON_KEY` | publishable key | **the same** |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key | **the same** secret key. Add it yourselves together; never send it in chat |
| `REQUIRE_AUTH` | `true` | `true` |
| `MAPPING_ENGINE`, `ANTHROPIC_API_KEY` | leave empty (free engine) | leave empty |

## What each site does

**Real users' site:** sign up, log in, their own visits. "Explore the demo" (start page) and "Open the demo" (Settings) **open the demo
site in a new tab**, so a real user's own data on this site is never replaced.

**Demo site:** the start page shows **"Try it as Theo"** with Theo's email and password and a **Log in as Theo** button (it fills in the
form). Logged in, visitors see Theo's synthetic data from the server, can try every feature, including **▶ Play Theo's visit** in At the visit,
and **Log out** clears Theo from their device. "Explore with demo data" (no login) also still works there.

## Theo's account is safe to share publicly
- It **can't be deleted** and **can't create doctor share links** (the server refuses both for the demo account).
- Visitors' changes stay on their own device; Theo's record on the server is read-only from the app.
- If anyone ever changes his password or data through Supabase directly, run `npm run seed:theo` to reset both.

## Check after setting it up
- Real users' site: the start page shows **"Explore the demo (Theo, synthetic) ↗"**, and it opens the demo site.
- Demo site: the start page shows **"Try it as Theo"** → **Log in as Theo** → Home says **"Hi Theo!"**.
- Demo site: `GET /api/health` answers, and `GET /api/demo` returns Theo (not 404).
