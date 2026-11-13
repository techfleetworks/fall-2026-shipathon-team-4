import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { THEO_SAMPLE_TRANSCRIPT } from '../../src/data/sampleTranscript.js';
import { summarizeNotes, summarizeVisit, type AfterVisitResult } from '../../src/lib/afterVisit/summary.js';
import { TARGET_GRADE } from '../../src/lib/afterVisit/readability.js';
import { processTranscript } from '../../src/lib/transcript/intake.js';

interface World {
  avs?: AfterVisitResult;
}

const payload = (text: string) => {
  const r = processTranscript(text, 'paste');
  if (r.status === 'crisis') return null;
  assert.equal(r.status, 'accepted');
  return r.status === 'accepted' ? r.payload : null;
};

When('Theo\'s visit transcript is summarized', function (this: World) {
  this.avs = summarizeVisit(payload(THEO_SAMPLE_TRANSCRIPT)!, { patientName: 'Theo', talkingPoints: ['Daytime sleepiness since the dose change'] });
});

When('a visit where the doctor says {string} is summarized', function (this: World, line: string) {
  this.avs = summarizeVisit(payload(`Sam: Hi.\nDr. Kim: Hello there.\nSam: I get dizzy.\nDr. Kim: ${line}`)!, { patientName: 'Sam' });
});

When('a visit where the patient says {string} is summarized', function (this: World, line: string) {
  const p = payload(`Sam: Hi.\nDr. Kim: Hello there.\nSam: ${line}\nDr. Kim: Okay.`);
  this.avs = p ? summarizeVisit(p, { patientName: 'Sam' }) : { status: 'crisis' };
});

When('the quick notes {string} are summarized', function (this: World, notes: string) {
  this.avs = summarizeNotes(notes);
});

const text = (w: World) => (w.avs?.status === 'ok' ? JSON.stringify(w.avs.summary) : '');

Then('the summary says {string}', function (this: World, s: string) {
  assert.ok(text(this).includes(s), `missing "${s}" in ${text(this)}`);
});

Then('the plan says {string}', function (this: World, s: string) {
  assert.ok(this.avs?.status === 'ok' && this.avs.summary.plan.includes(s), JSON.stringify(this.avs));
});

Then('it notes {string}', function (this: World, s: string) {
  assert.ok(this.avs?.status === 'ok' && this.avs.summary.notCovered.includes(s), JSON.stringify(this.avs));
});

Then('it reads at a 6th-grade level or below', function (this: World) {
  assert.ok(this.avs?.status === 'ok' && this.avs.summary.readingGrade <= TARGET_GRADE);
});

Then('the summary never says {string}', function (this: World, s: string) {
  assert.equal(this.avs?.status, 'ok');
  assert.ok(!text(this).toLowerCase().includes(s.toLowerCase()), `"${s}" appeared`);
});

Then('the summary goes to the crisis path', function (this: World) {
  assert.deepEqual(this.avs, { status: 'crisis' });
});

// ---- real users (quick notes)

import { planAfterVisitUpdate, type AfterVisitUpdate } from '../../src/lib/afterVisit/useAfterVisitSummary.js';
import type { Visit } from '../../src/lib/types.js';

interface RealWorld extends World {
  realVisit?: Visit;
  update?: AfterVisitUpdate;
}

Given('a real user\'s past visit with Dr. Kim has the quick notes {string}', function (this: RealWorld, notes: string) {
  this.realVisit = { id: 'v', date: '2026-11-10', clinician: 'Dr. Kim', priorities: [], askingFor: [], notes };
});

When('they open After for that visit', function (this: RealWorld) {
  const r = summarizeNotes(this.realVisit!.notes!, { talkingPoints: [] });
  assert.equal(r.status, 'ok');
  if (r.status === 'ok') this.update = planAfterVisitUpdate(this.realVisit!, r.summary, { visits: [this.realVisit!], followUps: [] });
});

Then('the recap says {string}', function (this: RealWorld, line: string) {
  assert.ok(this.update?.visitPatch.recap?.doctorSaid.some((l) => l.includes(line)), JSON.stringify(this.update));
});

Then('a next step {string} is added', function (this: RealWorld, step: string) {
  assert.ok(this.update?.newFollowUps.some((f) => f.step === step), JSON.stringify(this.update));
});
