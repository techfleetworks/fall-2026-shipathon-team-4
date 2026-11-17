import { describe, expect, it, vi } from 'vitest';
import { RESET_PATH, RESET_SENT_MESSAGE, hasRecoverySession, newPasswordProblem, requestPasswordReset, setNewPassword } from './auth.js';
import { SERVER_UNAVAILABLE_MESSAGE } from './api.js';

/** A fake Supabase auth client: each test says what Supabase answers. */
function fake({ resetError, session = true, updateError, throws }: { resetError?: string; session?: boolean; updateError?: string; throws?: boolean } = {}) {
  const auth = {
    resetPasswordForEmail: vi.fn(async () => { if (throws) throw new Error('fetch failed'); return { error: resetError ? { message: resetError } : null }; }),
    getSession: vi.fn(async () => ({ data: { session: session ? { access_token: 't' } : null } })),
    updateUser: vi.fn(async () => { if (throws) throw new Error('fetch failed'); return { error: updateError ? { message: updateError } : null }; }),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { client: { auth } as never, auth };
}

describe('Forgot password: send the reset link', () => {
  it('asks Supabase to email a link back to /reset-password on this site, with the email tidied', async () => {
    const { client, auth } = fake();
    const out = await requestPasswordReset('  Sam@Example.com ', { client, origin: 'https://app.example' });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('sam@example.com', { redirectTo: `https://app.example${RESET_PATH}` });
    expect(out).toEqual({ status: 'sent', message: RESET_SENT_MESSAGE });
  });

  it('says the same thing when the email has no account (no way to find out who signed up)', async () => {
    const { client } = fake({ resetError: 'User not found' });
    expect(await requestPasswordReset('nobody@example.com', { client, origin: '' })).toEqual({ status: 'sent', message: RESET_SENT_MESSAGE });
  });

  it('too many tries → wait message', async () => {
    const { client } = fake({ resetError: 'For security purposes, you can only request this after 45 seconds.' });
    expect(await requestPasswordReset('sam@example.com', { client, origin: '' })).toEqual({ status: 'error', message: 'Too many tries. Wait a few minutes and try again.' });
  });

  it('no connection → "couldn’t reach the server"', async () => {
    const { client } = fake({ throws: true });
    expect(await requestPasswordReset('sam@example.com', { client, origin: '' })).toEqual({ status: 'error', message: SERVER_UNAVAILABLE_MESSAGE });
  });

  it('without server sign-in → not configured', async () => {
    expect(await requestPasswordReset('sam@example.com', { client: null, origin: '' })).toEqual({ status: 'not-configured' });
  });
});

describe('Reset page: choose a new password', () => {
  it('same rules as sign-up', () => {
    expect(newPasswordProblem('short', 'short')).toBe('Use at least 8 characters for your password.');
    expect(newPasswordProblem('longenough1', 'longenough2')).toBe('Those passwords don’t match. Type the same password in both fields.');
    expect(newPasswordProblem('longenough1', 'longenough1')).toBeNull();
  });

  it('saves the new password, then signs out of the reset session so they log in normally', async () => {
    const { client, auth } = fake();
    expect(await setNewPassword('longenough1', 'longenough1', { client })).toEqual({ status: 'ok' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough1' });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('a bad new password is caught before anything is sent', async () => {
    const { client, auth } = fake();
    expect(await setNewPassword('short', 'short', { client })).toEqual({ status: 'error', message: 'Use at least 8 characters for your password.' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('an expired or already-used link → "expired" (nothing saved)', async () => {
    const { client, auth } = fake({ session: false });
    expect(await hasRecoverySession({ client })).toBe(false);
    expect(await setNewPassword('longenough1', 'longenough1', { client })).toEqual({ status: 'expired' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['New password should be different from the old password.', 'Choose a password you haven’t used for this account before.'],
    ['Password should be at least 8 characters.', 'Choose a stronger password: at least 8 characters.'],
    ['Something odd', 'We couldn’t save your new password. Please try again.'],
  ])('Supabase says "%s" → a clear message', async (supabaseSays, shown) => {
    const { client, auth } = fake({ updateError: supabaseSays });
    expect(await setNewPassword('longenough1', 'longenough1', { client })).toEqual({ status: 'error', message: shown });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('the session ran out while typing → "expired"', async () => {
    const { client } = fake({ updateError: 'Auth session missing!' });
    expect(await setNewPassword('longenough1', 'longenough1', { client })).toEqual({ status: 'expired' });
  });
});
