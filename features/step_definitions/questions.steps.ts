import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { buildTheoRecord } from '../../server/demo/theoRecord.js';
import { todayISO } from '../../src/lib/dates.js';
import { suggestQuestions, type QuestionInputs, type SuggestedQuestion } from '../../src/lib/questions/suggest.js';

interface World {
  qs?: SuggestedQuestion[];
  lastDate?: string;
}

When('questions are suggested for Theo\'s next visit', function (this: World) {
  const theo = buildTheoRecord() as unknown as QuestionInputs;
  const today = todayISO();
  this.qs = suggestQuestions(theo, theo.visits.find((v) => v.date >= today), today);
  this.lastDate = theo.visits.find((v) => v.date < today)!.date;
});

When('questions are suggested for a new patient with no history', function (this: World) {
  this.qs = suggestQuestions({ visits: [], evidence: [], summaries: [] }, undefined, todayISO());
});

Then('one question is {string}', function (this: World, text: string) {
  assert.ok(this.qs?.some((q) => q.text === text), JSON.stringify(this.qs));
});

Then('its reason is {string} his last visit date', function (this: World, prefix: string) {
  const q = this.qs!.find((x) => x.id === 'uncovered-orthostatic')!;
  const when = new Date(`${this.lastDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  assert.equal(q.why, `${prefix} ${when}.`);
});

Then('no question starts with {string}', function (this: World, start: string) {
  assert.ok(!this.qs?.some((q) => q.text.startsWith(start)));
});

Then('there are no suggestions', function (this: World) {
  assert.deepEqual(this.qs, []);
});
