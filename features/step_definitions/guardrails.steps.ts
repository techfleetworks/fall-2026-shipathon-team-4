import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { BLOCKED_FALLBACK, guardResponse, type GuardResult } from '../../src/lib/guardrails/index.js';

interface World {
  input: string;
  result?: GuardResult;
}

Given('the patient wrote {string}', function (this: World, input: string) {
  this.input = input;
});

When('the engine answers {string}', function (this: World, output: string) {
  this.result = guardResponse(output, { input: this.input });
});

Then('the response goes to the crisis path', function (this: World) {
  assert.deepEqual(this.result, { status: 'crisis' });
});

Then('the response is blocked for {string}', function (this: World, rule: string) {
  assert.equal(this.result?.status, 'blocked', `expected blocked, got ${JSON.stringify(this.result)}`);
  if (this.result?.status === 'blocked') assert.ok(this.result.violations.some((v) => v.rule === rule), `no ${rule} violation`);
});

Then('the patient sees the honest fallback', function (this: World) {
  assert.ok(this.result?.status === 'blocked' && this.result.message === BLOCKED_FALLBACK);
});

Then('the response is shown unchanged', function (this: World) {
  assert.equal(this.result?.status, 'ok', `expected ok, got ${JSON.stringify(this.result)}`);
});

// ---- crisis in the story (talk/type box) and the handoff ----
import { CRISIS_DETECTED_RESOURCES, CRISIS_HANDOFF, crisisMessageText, storyDraftHasCrisis } from '../../src/lib/guardrails/index.js';
import type { StoryDraft } from '../../src/lib/types.js';

interface StoryWorld {
  story?: StoryDraft;
  crisisPath?: boolean;
  shown?: string;
}

const emptyStory = (): StoryDraft => ({
  opening: '',
  onset: { text: '' },
  frequency: { text: '' },
  severity: { impacts: [], text: '' },
  triggers: { choices: [], text: '' },
  tried: { choices: [], medName: '', medDose: '', medDuration: '', outcome: '', text: '' },
});

Given('the patient typed {string} into the {string} step of their story', function (this: StoryWorld, text: string, step: string) {
  this.story = emptyStory();
  const s = this.story as unknown as Record<string, { text: string } | string>;
  if (step === 'opening') this.story.opening = text;
  else (s[step] as { text: string }).text = text;
});

When('the story is about to become a summary', function (this: StoryWorld) {
  this.crisisPath = storyDraftHasCrisis(this.story!);
});

Then('the story goes to the crisis path instead', function (this: StoryWorld) {
  assert.equal(this.crisisPath, true);
});

When('crisis support is shown after crisis language', function (this: StoryWorld) {
  this.shown = JSON.stringify([CRISIS_HANDOFF, CRISIS_DETECTED_RESOURCES, crisisMessageText()]);
});

Then('988 is the first resource', function () {
  assert.equal(CRISIS_DETECTED_RESOURCES[0]?.id, '988');
});

Then('nothing in it mentions police or rescue', function (this: StoryWorld) {
  assert.doesNotMatch(this.shown ?? '', /police|rescue/i);
});
