---
status: proposed
date: 2026-11-17
deciders: Team 4 full stack (author); screen design and wording: Diana (frontend), Veena (design), Dominic (Product)
---

# ADR-023: Forgot password (reset by email link)

## Context

"Forgot your password?" on the log-in screen only said: *reset isn't available, make a new account*. That was written for the early
on-device-only version. With server accounts (Supabase, ADR-005) it is wrong and harmful: the same email can't sign up again, so a
person who forgets their password loses their account and their backup (ADR-018/019). Supabase supports reset by email link.

## Decision

- **Send link** (`requestPasswordReset` in `src/lib/auth.ts`): the log-in screen's "Forgot your password?" opens a small panel; "Send
  reset link" uses the email typed above and asks Supabase to email a link to `/reset-password` on this site. The answer is **the same
  whether or not the email has an account** (no account discovery); only "too many tries" and "can't reach the server" are reported.
- **Reset page** (`/reset-password`, `src/screens/public/ResetPassword.tsx`): Supabase reads the link (short recovery session); the
  person enters the new password twice (sign-up's rules: 8+ characters, matching); `setNewPassword` saves it, **signs out of the
  recovery session**, and sends them to log in ("Your password was changed…"), so the normal log-in runs (including backup restore).
  An expired or already-used link shows "This link has expired" with "Get a new link" (back to log-in with the panel open).
- Same layout and classes as the log-in screen. Hidden on the **demo site** (Theo's shared account must never be reset) and when server
  sign-in isn't set up (the old note stays).

## Consequences

- Good: no one is locked out by a forgotten password; free (Supabase).
- Needs setup in Supabase (both real and, for completeness, DEMO is not needed): add `<site>/reset-password` to **Authentication → URL
  Configuration → Redirect URLs** for the real site (and `http://localhost:5173/reset-password` for local testing); review the
  "Reset password" email template. Supabase's built-in email sender only sends a few emails an hour: fine for testing, not for real
  users. A custom SMTP sender (also needed for "Verify email") should be set up before launch.
- Design: a "Reset password" screen and the panel's wording are drafts; flagged for Diana and Veena as a design placeholder.

## Verification

`src/lib/passwordReset.test.ts` (13, fake Supabase: link to /reset-password with the email tidied, same message for unknown emails, rate
limit, offline, not configured, password rules, save + sign out, bad password never sent, expired link saves nothing, Supabase error
messages mapped, session ran out). `features/password-reset.feature` (4). Mutation-checked: revealing unknown emails, saving without a
valid reset link, and staying in the recovery session each failed a test. Not tested end to end with a real email.
