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
