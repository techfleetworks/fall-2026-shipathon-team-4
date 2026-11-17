import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { detectCues, type CueContext, type CueResult } from '../../src/lib/cues/cues.js';

interface World { bbCtx?: CueContext; bbOut?: CueResult }

Given('my talking points and my medication change on {string}', function (this: World, date: string) {
  this.bbCtx = {
    priorities: ['Dizzy and lightheaded when standing up', 'Daytime sleepiness since the dose increase'],
    covered: [],
    latestMedChange: { label: 'Ziprasidone dose increased', date },
  };
});

When('I hear {string}', function (this: World, said: string) {
  this.bbOut = detectCues([said], this.bbCtx!);
});
When('I hear {string} and {string}', function (this: World, a: string, b: string) {
  this.bbOut = detectCues([a, b], this.bbCtx!);
});

Then('a cue says I could say {string}', function (this: World, text: string) {
  assert.ok(this.bbOut!.cues.some((c) => c.say.includes(text)), JSON.stringify(this.bbOut));
});
Then('there is no cue', function (this: World) {
  assert.deepEqual(this.bbOut!.cues, []);
});
Then('the app suggests ticking {string}', function (this: World, point: string) {
  assert.deepEqual(this.bbOut!.coveredSuggestions, [point]);
});
