# Turning on server sign-up / log-in (Supabase)

**Owner:** Yadira (backend). About 15 minutes. The code is already in place; these steps switch it on.
Until they're done, the app keeps its on-device sign-in, so the demo always works.

You'll do the account and key steps yourself. Keys are like passwords: don't paste them into chats or commit them.

---

## 1. Create the project
1. Go to **supabase.com** → sign in (GitHub sign-in is easiest).
2. **First time? Create an organization** (Supabase asks for this before any project):
   name e.g. `Appointment Ready`, type *Personal*, plan **Free – $0/month** → **Create organization**.
3. Supabase then opens **Create a new project** (or open the organization → **New project**):
   name `appointment-ready`; database password: **Generate a password** and save it in a password manager;
   region closest to your team (e.g. *East US*) → **Create new project**.
4. Wait about 2 minutes for it to finish setting up.

## 2. Create the database table
1. In the project: **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261111000000_profiles.sql` from this repo, copy all of it, paste, and click **Run**.
3. Check: **Table Editor** shows `profiles`, with a **RLS enabled** label.

## 3. Sign-in settings
**Authentication → Sign In / Providers → Email**:
- Keep **Email** on.
- **Confirm email**: for the Shipathon demo you can turn this **off**, so a new account works right away. With it on,
  people must click the email link before logging in (the app tells them so). Turn it back on before real users.
- Minimum password length: **8** (matches the app).

**Authentication → URL Configuration**: set **Site URL** to the Vercel production address once you have it, and
add `http://localhost:5173` under **Redirect URLs** for local testing.

## 4. Get the keys
**Project Settings → API** (or **Data API / API Keys**):
- **Project URL**, e.g. `https://abcd1234.supabase.co`
- **anon / public** key. Safe in the browser (Row-Level Security protects the data).
- **service_role** key. **SECRET.** Server only; it can bypass every rule. Only used to delete accounts.

## 5. Local development
1. Copy `.env.example` to **`.env.local`** in the repo folder (it's git-ignored, so it's never committed).
2. Fill in: `VITE_SUPABASE_URL` and `SUPABASE_URL` = Project URL; `VITE_SUPABASE_ANON_KEY` and
   `SUPABASE_ANON_KEY` = anon key; `SUPABASE_SERVICE_ROLE_KEY` = service_role key.
3. Start the API server with the keys loaded:
   ```bash
   npm run dev:api:supabase
   ```
   and in a second terminal `npm run dev` (Vite reads `.env.local` on its own).
4. Test: create an account at `http://localhost:5173/signup`. It appears in Supabase under **Authentication → Users**,
   and `profiles` gets a row with the name. Then log out and log in.

## 6. Vercel (the live site)
**Vercel → your project → Settings → Environment Variables**, for **Production** and **Preview**:

| Name | Value | Who sees it |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | the browser (public) |
| `VITE_SUPABASE_ANON_KEY` | anon key | the browser (public) |
| `SUPABASE_URL` | Project URL | server only |
| `SUPABASE_ANON_KEY` | anon key | server only |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **server only, secret** |
| `REQUIRE_AUTH` | `true` | server only |

Then **redeploy** (Deployments → ⋯ → Redeploy), because `VITE_` values are baked in at build time.

## 7. Check it worked
- Sign up on the deployed app → the user appears in Supabase **Authentication → Users**.
- While signed out, an API call is refused: `curl -X POST https://<your-app>/api/visit-summary -H "Content-Type: application/json" -d "{\"transcript\":\"Dr. A: hi\"}"`
  → `401 {"status":"error","error":{"code":"UNAUTHORIZED",...}}`.
- Settings → **Delete account** → the user disappears from Supabase, and their `profiles` row too.

## What's on the server after this
- **Supabase Auth:** each person's email and a **hash** of their password (Supabase handles hashing; our code never stores it).
- **`profiles` table:** first and last name. Only that person can read or change their row; deleting the account deletes it.
- **Still on the device for now:** stories, visits, recaps (ADR-001 Decision 5 moves the approved ones to the database next).

## 8. Sharing with doctors (ADR-009)
Run once, after step 2: **SQL Editor → New query →** paste all of
`supabase/migrations/20261112000000_shared_briefs.sql` **→ Run.** It adds two tables:

- **`care_team`**: the people a patient shares with (name, role, work email, clinic).
- **`shared_briefs`**: one expiring link per person, holding the frozen one-page brief and a **hash** of the link
  (the link itself is never stored).

Both have Row-Level Security (each person reads only their own rows) and are deleted with the account.
Nothing to add in Vercel: the API uses the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` you already set.
Check: **Table Editor** shows both tables with the "RLS enabled" label. `GET /api/shared/<anything>` on the live site
answers `404 LINK_NOT_FOUND` (before the migration it answers `503` or `500`).

**On the server after this:** the one-page briefs a patient chose to share, until they expire, are stopped, or the
account is deleted. Expired and stopped links stay in the table (so the patient's "Shared with" list stays accurate)
until the account is deleted. A cleanup job for old links is a follow-up.
