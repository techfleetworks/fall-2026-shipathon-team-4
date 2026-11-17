import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { RESET_SENT_MESSAGE, requestPasswordReset, setNewPassword } from '../../src/lib/auth.js';

interface Calls { reset: { email: string; redirectTo: string }[]; updated: string[] }
interface World { prCalls: Calls; prSession: boolean; prSent?: { status: string; message?: string }; prSaved?: { status: string } }

function client(w: World, { unknownEmail = false } = {}) {
  w.prCalls ??= { reset: [], updated: [] };
  return {
    auth: {
      resetPasswordForEmail: async (email: string, o: { redirectTo: string }) => {
        w.prCalls.reset.push({ email, redirectTo: o.redirectTo });
        return { error: unknownEmail ? { message: 'User not found' } : null };
      },
      getSession: async () => ({ data: { session: w.prSession ? {} : null } }),
      updateUser: async ({ password }: { password: string }) => { w.prCalls.updated.push(password); return { error: null }; },
      signOut: async () => ({ error: null }),
    },
  } as never;
}

When('I ask for a reset link for {string}', async function (this: World, email: string) {
  this.prSent = await requestPasswordReset(email, { client: client(this), origin: 'https://app.example' });
});
When('someone asks for a reset link for an email with no account', async function (this: World) {
  this.prSent = await requestPasswordReset('nobody@example.com', { client: client(this, { unknownEmail: true }), origin: '' });
});
Given('I opened a valid reset link', function (this: World) { this.prSession = true; });
Given('the reset link has expired', function (this: World) { this.prSession = false; });
When('I save the new password {string} twice', async function (this: World, pw: string) {
  this.prSaved = await setNewPassword(pw, pw, { client: client(this) });
});

Then('Supabase is asked to email a link that opens {string}', function (this: World, path: string) {
  assert.equal(this.prCalls.reset[0].redirectTo, `https://app.example${path}`);
});
Then("I'm told to check my email", function (this: World) { assert.equal(this.prSent?.message, RESET_SENT_MESSAGE); });
Then('they see the same message as for a real account', function (this: World) {
  assert.deepEqual(this.prSent, { status: 'sent', message: RESET_SENT_MESSAGE });
});
Then("the new password is saved and I'm sent to log in", function (this: World) {
  assert.deepEqual(this.prSaved, { status: 'ok' });
  assert.deepEqual(this.prCalls.updated, ['longenough1']);
});
Then("nothing is saved and I'm told to get a new link", function (this: World) {
  assert.deepEqual(this.prSaved, { status: 'expired' });
  assert.deepEqual(this.prCalls?.updated ?? [], []);
});
