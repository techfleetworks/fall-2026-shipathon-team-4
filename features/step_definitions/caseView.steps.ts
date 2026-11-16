import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { buildTheoRecord } from '../../server/demo/theoRecord.js';
import { todayISO } from '../../src/lib/dates.js';
import { ENGINE_VOCABULARY } from '../../src/lib/engine.js';
import { buildCaseView, type CaseInputs, type CaseViewResult } from '../../src/lib/caseView/caseView.js';

interface World { cv?: CaseViewResult }
const EMPTY: CaseInputs = { medications: [], evidence: [], visits: [], followUps: [] };
const view = (w: World) => {
  assert.equal(w.cv?.status, 'ok');
  return (w.cv as Extract<CaseViewResult, { status: 'ok' }>).view;
};
const lines = (w: World) => {
  const v = view(w);
  return [...v.patterns.map((p) => p.text), ...v.openQuestions.flatMap((q) => [q.text, q.why]), ...v.highlights.map((h) => h.text)];
};

When('the case view is built for Theo', function (this: World) {
  this.cv = buildCaseView(buildTheoRecord() as unknown as CaseInputs, todayISO());
});

When('the case view is built for a new user with no history', function (this: World) {
  this.cv = buildCaseView(EMPTY, todayISO());
});

When('the case view is built for a medication change on {string} and a symptom on {string}', function (this: World, med: string, sym: string) {
  this.cv = buildCaseView({
    ...EMPTY,
    evidence: [
      { id: 'm', date: med, type: 'medication', title: 'Medication', detail: 'Dose up' },
      { id: 's', date: sym, type: 'symptom', title: 'Symptom', detail: 'Dizzy' },
    ],
  }, '2026-11-15');
});

When('the case view is built for a medication change on {string} and a symptom on {string} called {string}', function (this: World, med: string, sym: string, detail: string) {
  this.cv = buildCaseView({
    ...EMPTY,
    evidence: [
      { id: 'm', date: med, type: 'medication', title: 'Medication', detail: 'Dose up' },
      { id: 's', date: sym, type: 'symptom', title: 'Symptom', detail },
    ],
  }, '2026-11-15');
});

Then('the doctor reads the timing pattern as {string}', function (this: World, text: string) {
  const p = view(this).patterns.find((x) => x.kind === 'timing');
  assert.ok(p?.clinical.includes(text), p?.clinical);
});

Then('the presenting symptoms include {string}', function (this: World, term: string) {
  assert.ok(view(this).clinical.presenting.includes(term), JSON.stringify(view(this).clinical.presenting));
});

Then('every presenting symptom comes from the approved vocabulary', function (this: World) {
  for (const t of view(this).clinical.presenting) assert.ok(ENGINE_VOCABULARY.includes(t), t);
});

When('the case view is built for a record with a note {string}', function (this: World, note: string) {
  this.cv = buildCaseView({ ...EMPTY, evidence: [{ id: 'n', date: '2026-11-01', type: 'note', title: 'Note', detail: note }] }, '2026-11-15');
});

Then('a pattern says {string}', function (this: World, text: string) {
  assert.ok(view(this).patterns.some((p) => p.text.includes(text)), JSON.stringify(view(this).patterns));
});

Then('that pattern points to {int} entries in his record', function (this: World, n: number) {
  assert.equal(view(this).patterns.find((p) => p.kind === 'timing')!.refs.length, n);
});

Then('there is not enough history yet', function (this: World) {
  assert.equal(view(this).enough, false);
});

Then('there are no patterns, open questions or key dates', function (this: World) {
  const v = view(this);
  assert.deepEqual([v.patterns, v.openQuestions, v.highlights], [[], [], []]);
});

Then('there are no patterns', function (this: World) {
  assert.deepEqual(view(this).patterns, []);
});

Then('no line says {string}, {string}, {string} or {string}', function (this: World, a: string, b: string, c: string, d: string) {
  const words = [a, b, c, d];
  for (const l of lines(this)) for (const w of words) assert.ok(!l.toLowerCase().includes(w), `${l} contains ${w}`);
});

Then('the result is the crisis path', function (this: World) {
  assert.deepEqual(this.cv, { status: 'crisis' });
});
