import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import request, { type Response } from 'supertest';
import { createApp } from '../../server/app.js';
import { THEO_SAMPLE_TRANSCRIPT } from '../../src/data/sampleTranscript.js';

const app = createApp();

interface World {
  res?: Response;
}

function res(world: World): Response {
  assert.ok(world.res, 'no request was sent');
  return world.res;
}

When('I GET {string}', async function (this: World, path: string) {
  this.res = await request(app).get(path);
});

When("I POST Theo's sample transcript to {string}", async function (this: World, path: string) {
  this.res = await request(app).post(path).send({ transcript: THEO_SAMPLE_TRANSCRIPT, source: 'sample' });
});

When('I POST the JSON {string} to {string}', async function (this: World, json: string, path: string) {
  this.res = await request(app).post(path).send(JSON.parse(json));
});

When('I POST the transcript {string} to {string}', async function (this: World, transcript: string, path: string) {
  // Gherkin passes "\n" as two characters; turn it into a real line break.
  this.res = await request(app).post(path).send({ transcript: transcript.replace(/\\n/g, '\n') });
});

When("I POST Theo's sample transcript with patient {string} to {string}", async function (this: World, patientName: string, path: string) {
  this.res = await request(app).post(path).send({ transcript: THEO_SAMPLE_TRANSCRIPT, source: 'sample', patientName });
});

Then('the recap has {int} lines from {string}', function (this: World, n: number, clinician: string) {
  assert.equal(res(this).body.doctorSaid?.length, n);
  assert.deepEqual(res(this).body.clinicians, [clinician]);
});

When('I POST the raw JSON {string} to {string}', async function (this: World, raw: string, path: string) {
  this.res = await request(app).post(path).set('Content-Type', 'application/json').send(raw);
});

When('I POST the text {string} to {string}', async function (this: World, text: string, path: string) {
  this.res = await request(app).post(path).set('Content-Type', 'text/plain').send(text);
});

When('I POST a transcript of {int} characters to {string}', async function (this: World, n: number, path: string) {
  this.res = await request(app).post(path).send({ transcript: 'a'.repeat(n) });
});

Then('the response status is {int}', function (this: World, status: number) {
  assert.equal(res(this).status, status);
});

Then('the response field {string} is {string}', function (this: World, field: string, value: string) {
  assert.equal(res(this).body[field], value);
});

Then('the payload label is exactly {string}', function (this: World, label: string) {
  assert.equal(res(this).body.payload?.disclaimer, label);
});

Then('the error code is {string}', function (this: World, code: string) {
  assert.equal(res(this).body.error?.code, code);
});

Then('the response has no payload', function (this: World) {
  assert.ok(!('payload' in res(this).body));
});

Then('the response does not contain {string}', function (this: World, marker: string) {
  assert.ok(!res(this).text.includes(marker));
});

Then('the header {string} is {string}', function (this: World, name: string, value: string) {
  assert.equal(res(this).headers[name], value);
});

Then('there is no {string} header', function (this: World, name: string) {
  assert.equal(res(this).headers[name], undefined);
});
