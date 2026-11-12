import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { mappingEngineFromEnv } from '../../server/mapping/config.js';
import { storyOf } from '../../server/mapping/eval.js';
import { RULES_ENGINE, runMapping, type MappingResult } from '../../server/mapping/pipeline.js';
import { standInEngine } from '../../server/mapping/standIn.js';
import type { MappingEngine } from '../../server/mapping/types.js';

interface World {
  engine: MappingEngine;
  aiCalls: number;
  result?: MappingResult;
}

Given('no AI engine is configured', function (this: World) {
  this.engine = RULES_ENGINE;
});

Given('the AI engine answers the term {string} quoting {string}', function (this: World, term: string, quote: string) {
  this.aiCalls = 0;
  this.engine = standInEngine(() => {
    this.aiCalls += 1;
    return { crisis_language: false, symptoms: [{ term, patient_quote: quote }] };
  });
});

Given('the AI engine is down', function (this: World) {
  this.engine = standInEngine(() => {
    throw new Error('service unavailable');
  });
});

When('the story {string} is mapped', async function (this: World, story: string) {
  const warn = console.warn;
  console.warn = () => {}; // fallbacks log a reason; keep the test output clean
  try {
    this.result = await runMapping(storyOf(story), this.engine);
  } finally {
    console.warn = warn;
  }
});

const symptoms = (r?: MappingResult) => (r?.status === 'ok' ? r.fields.find((f) => f.key === 'symptoms')!.clinical : '');

Then('the summary lists {string}', function (this: World, term: string) {
  assert.ok(symptoms(this.result).includes(term), `expected "${term}" in ${JSON.stringify(this.result)}`);
});

Then('the summary does not mention {string}', function (this: World, text: string) {
  // The doctor-terms lines only: the patient's own words are echoed back in each line's quote on purpose.
  assert.equal(this.result?.status, 'ok');
  const clinical = this.result?.status === 'ok' ? this.result.fields.map((f) => f.clinical).join('\n') : '';
  assert.ok(!clinical.toLowerCase().includes(text.toLowerCase()), `"${text}" leaked into the doctor-terms lines`);
});

Then('the {string} engine answered', function (this: World, name: string) {
  assert.equal(this.result?.engine, name);
});

Then('the response goes to the crisis path without calling the AI engine', function (this: World) {
  assert.equal(this.result?.status, 'crisis');
  assert.equal(this.aiCalls, 0);
});

Given('the server is set to MAPPING_ENGINE {string} with no API key', function (this: World, value: string) {
  this.engine = mappingEngineFromEnv({ MAPPING_ENGINE: value }).engine;
});

Then('the free rules engine is used', function (this: World) {
  assert.equal(this.engine, RULES_ENGINE);
  assert.equal(this.engine.mapper, undefined);
});
