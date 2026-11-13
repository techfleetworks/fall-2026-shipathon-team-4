import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { extractActionItems, type ActionItem } from '../../src/lib/afterVisit/actionItems.js';
import { summarizeVisit } from '../../src/lib/afterVisit/summary.js';
import { processTranscript } from '../../src/lib/transcript/intake.js';

interface World {
  booked?: { date: string; clinician: string }[];
  items?: ActionItem[];
}

Given('a visit with Dr. Kim is already booked two weeks later', function (this: World) {
  this.booked = [{ date: '2026-11-27', clinician: 'Dr. Kim' }];
});

When('action items are extracted from a visit where Dr. Kim says {string}', function (this: World, line: string) {
  const p = processTranscript(`Sam: Hi.\nDr. Kim: Hello there.\nSam: I feel off and I get dizzy when I stand.\nDr. Kim: ${line}`, 'paste');
  assert.equal(p.status, 'accepted');
  if (p.status !== 'accepted') return;
  const s = summarizeVisit(p.payload, { patientName: 'Sam' });
  assert.equal(s.status, 'ok');
  if (s.status !== 'ok') return;
  this.items = extractActionItems(s.summary, { visitDate: '2026-11-13', clinician: 'Dr. Kim', upcomingVisits: this.booked ?? [] });
});

Then('there is a step {string} for {string}', function (this: World, step: string, owner: string) {
  assert.ok(this.items?.some((i) => i.step === step && i.owner === owner), JSON.stringify(this.items));
});

Then('there is no step to book a follow-up', function (this: World) {
  assert.ok(!this.items?.some((i) => i.isVisit), JSON.stringify(this.items));
});

Then('no follow-up or doctor task is made up', function (this: World) {
  // Only the dizziness the patient raised (and the doctor skipped) can remain; no plan or promise is invented.
  assert.ok(this.items?.every((i) => i.step.startsWith('Ask about')), JSON.stringify(this.items));
});
