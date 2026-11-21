import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { requestStorySummary, type StorySummaryOutcome } from '../../src/lib/storySummary.js';
import type { StoryDraft } from '../../src/lib/types.js';

interface World { swsSession?: boolean; swsOut?: StorySummaryOutcome }

const unauthorized: typeof fetch = async () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 });
const draftOf = (opening: string) => ({
  opening, onset: { text: '' }, frequency: { text: '' }, severity: { impacts: [], text: '' },
  triggers: { choices: [], text: '' }, tried: { choices: [], medName: '', medDose: '', medDuration: '', outcome: '', text: '' },
}) as unknown as StoryDraft;

Given('the server answers "please log in" and there is no sign-in on this device', function (this: World) { this.swsSession = false; });
Given('the server answers "please log in" and this device had a sign-in', function (this: World) { this.swsSession = true; });

When('I describe how I feel as {string}', async function (this: World, words: string) {
  const had = this.swsSession!;
  this.swsOut = await requestStorySummary(draftOf(words), { fetchImpl: unauthorized, hasSession: async () => had });
});

Then('my words are turned into doctor terms on this device', function (this: World) {
  const out = this.swsOut!;
  assert.equal(out.status, 'ok');
  assert.match(out.status === 'ok' ? out.fields.find((f) => f.key === 'symptoms')!.clinical : '', /Insomnia/);
});
Then('nothing tells me my sign-in expired', function (this: World) { assert.equal(this.swsOut!.signInExpired, undefined); });
Then("I'm told to log in again, without being blocked", function (this: World) { assert.equal(this.swsOut!.signInExpired, true); });
Then("I'm sent to crisis support", function (this: World) { assert.equal(this.swsOut!.status, 'crisis'); });
