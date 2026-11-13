import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { THEO_CLINICAL_NOTE, THEO_LABS } from '../../src/data/sampleResults.js';
import { explainLab, type LabExplanation } from '../../src/lib/labs/labs.js';
import { explainResults, type ResultsOutcome } from '../../src/lib/labs/results.js';

interface World {
  lab?: LabExplanation;
  results?: ResultsOutcome;
}

When('the patient\'s {string} result {string} with range {string} is explained', function (this: World, test: string, value: string, typicalRange: string) {
  this.lab = explainLab({ test, value, typicalRange });
});

Then('it is placed {string} with {string}', function (this: World, position: string, summary: string) {
  assert.equal(this.lab?.position, position);
  assert.equal(this.lab?.summary, summary);
});

When('Theo\'s labs and clinical note are explained', function (this: World) {
  this.results = explainResults({ labs: THEO_LABS, note: THEO_CLINICAL_NOTE });
});

When('Theo\'s labs are explained with the note {string}', function (this: World, note: string) {
  this.results = explainResults({ labs: THEO_LABS, note });
});

Then('{int} lab results and the note term {string} are explained', function (this: World, count: number, term: string) {
  assert.equal(this.results?.status, 'ok');
  if (this.results?.status !== 'ok') return;
  assert.equal(this.results.labs.length, count);
  assert.ok(this.results.note.some((e) => e.found === term), `"${term}" not explained`);
});

Then('the results go to the crisis path', function (this: World) {
  assert.deepEqual(this.results, { status: 'crisis' });
});
