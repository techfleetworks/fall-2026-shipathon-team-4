import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { explainClinical, type ExplainResult } from '../../src/lib/explain/explain.js';
import { GLOSSARY, plainFor } from '../../src/lib/explain/glossary.js';
import { checkOutput } from '../../src/lib/guardrails/checks.js';

interface World {
  explained?: ExplainResult;
}

const explanations = (w: World) => (w.explained?.status === 'ok' ? w.explained.explanations : []);

When('the patient asks to explain {string}', function (this: World, text: string) {
  this.explained = explainClinical(text);
});

Then('{string} is explained as {string}', function (this: World, found: string, plain: string) {
  const e = explanations(this).find((x) => x.found === found);
  assert.ok(e, `nothing explained for "${found}" in ${JSON.stringify(this.explained)}`);
  assert.equal(e.plain, plain);
});

Then('there is nothing to explain', function (this: World) {
  assert.deepEqual(this.explained, { status: 'ok', explanations: [] });
});

Then('no explanation mentions {string}', function (this: World, word: string) {
  assert.equal(this.explained?.status, 'ok');
  assert.ok(!explanations(this).some((e) => e.plain.toLowerCase().includes(word.toLowerCase())), `an explanation mentions "${word}"`);
});

Then('the explainer goes to the crisis path', function (this: World) {
  assert.deepEqual(this.explained, { status: 'crisis' });
});

Then('every glossary explanation passes the guardrail checks with nothing to echo', function () {
  const samples: Record<string, string> = { age: '30 y/o', weeks: '5/52', query: 'query', versus: 'A vs. B' };
  for (const entry of GLOSSARY) {
    const m = new RegExp(entry.match.source, entry.match.flags).exec(samples[entry.id] ?? entry.term);
    assert.ok(m, `${entry.id} does not match its own sample`);
    const { violations } = checkOutput(plainFor(entry, m), { input: '' });
    assert.deepEqual(violations.map((v) => v.rule), [], `${entry.id} breaks a rule`);
  }
});
