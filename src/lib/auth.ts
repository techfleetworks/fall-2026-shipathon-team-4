/**
 * Sign-up / log-in, owned by the backend (ADR-001: Supabase Auth). Screens call these functions; they never
 * talk to Supabase directly. Every function returns a result with a `status` and never throws.
 *
 * Two modes:
 *  - Supabase configured (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY): accounts live on the Supabase server.
 *    Passwords never touch our code beyond being sent to Supabase over HTTPS; Supabase stores only a hash.
 *  - Not configured: isServerAuthEnabled() is false and screens keep their on-device fallback (demo).
 */
import { setAccessTokenProvider, SERVER_UNAVAILABLE_MESSAGE } from './api';
import { supabase } from './supabaseClient';

export function isServerAuthEnabled(): boolean {
  return supabase !== null;
}

// Every /api call carries the signed-in user's token (the Express server checks it).
if (supabase) {
  setAccessTokenProvider(async () => (await supabase!.auth.getSession()).data.session?.access_token ?? null);
}

export type AuthResult =
  | { status: 'ok'; user: { email: string; firstName: string; lastName: string } }
  /** Sign-up worked but Supabase wants the email confirmed before logging in. */
  | { status: 'confirm-email'; message: string }
  | { status: 'error'; message: string }
  | { status: 'not-configured' };

const CONFIRM_EMAIL = 'Check your email to confirm your account, then log in.';

/** Supabase error → a message that's safe to show and doesn't reveal whether an email has an account. */
function friendly(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Try again, or reset your password.';
  if (m.includes('email not confirmed')) return CONFIRM_EMAIL;
  if (m.includes('password') && (m.includes('weak') || m.includes('at least'))) return 'Choose a stronger password: at least 8 characters.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('fetch') || m.includes('network')) return SERVER_UNAVAILABLE_MESSAGE;
  // Same message for "already registered" and anything else, so sign-up can't be used to find out who has an account.
  return 'We couldn’t complete that. Check your details and try again.';
}

function userFrom(u: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined) {
  const meta = u?.user_metadata ?? {};
  return {
    email: u?.email ?? '',
    firstName: typeof meta.first_name === 'string' ? meta.first_name : '',
    lastName: typeof meta.last_name === 'string' ? meta.last_name : '',
  };
}

export async function signUp(input: { email: string; password: string; firstName: string; lastName: string }): Promise<AuthResult> {
  if (!supabase) return { status: 'not-configured' };
  try {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { first_name: input.firstName, last_name: input.lastName } },
    });
    if (error) return { status: 'error', message: friendly(error.message) };
    if (!data.session) return { status: 'confirm-email', message: CONFIRM_EMAIL };
    return { status: 'ok', user: userFrom(data.user) };
  } catch {
    return { status: 'error', message: SERVER_UNAVAILABLE_MESSAGE };
  }
}

export async function logIn(input: { email: string; password: string }): Promise<AuthResult> {
  if (!supabase) return { status: 'not-configured' };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) return { status: 'error', message: friendly(error.message) };
    return { status: 'ok', user: userFrom(data.user) };
  } catch {
    return { status: 'error', message: SERVER_UNAVAILABLE_MESSAGE };
  }
}

/** Ends the session on this device. Safe to call when not configured or already logged out. */
export async function logOut(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* the local sign-out still happens */
  }
}

/**
 * Deletes the account on the server (DELETE /api/account), which also removes the user's rows in the
 * database (ON DELETE CASCADE). Call before wiping the device; if it fails, don't wipe, so the user can retry.
 */
export async function deleteServerAccount(fetchImpl: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: true };
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return { ok: false, message: 'Please log in again, then delete your account.' };
    const res = await fetchImpl('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.status !== 204) return { ok: false, message: 'We couldn’t delete your account just now. Nothing was deleted; please try again.' };
    await logOut();
    return { ok: true };
  } catch {
    return { ok: false, message: SERVER_UNAVAILABLE_MESSAGE };
  }
}
