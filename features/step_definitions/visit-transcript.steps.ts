import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { THEO_SAMPLE_TRANSCRIPT } from '../../src/data/sampleTranscript';
import { decodeTranscriptFile, processTranscript } from '../../src/lib/transcript/intake';
import type { TranscriptOutcome, TranscriptPayload, TranscriptSource } from '../../src/lib/transcript/types';

interface World {
  raw?: string;
  source: TranscriptSource;
  file?: { name: string; bytes: Uint8Array };
  outcome?: TranscriptOutcome;
}

/** Turn Gherkin escape sequences (\n, \r, \t, \s, \uXXXX) into real characters. */
function unescape(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\s/g, ' ');
}

Given("Theo's sample transcript", function (this: World) {
  this.raw = THEO_SAMPLE_TRANSCRIPT;
  this.source = 'sample';
});

Given('the pasted text {string}', function (this: World, text: string) {
  this.raw = unescape(text);
  this.source = 'paste';
});

Given('a transcript of exactly {int} characters', function (this: World, n: number) {
  this.raw = 'a'.repeat(n);
  this.source = 'paste';
});

Given('a transcript of exactly {int} characters containing the marker {string}', function (this: World, n: number, marker: string) {
  this.raw = (marker + ' ').repeat(Math.ceil(n / (marker.length + 1))).slice(0, n);
  this.source = 'paste';
});

Given('an uploaded file {string} containing {string}', function (this: World, name: string, content: string) {
  this.file = { name, bytes: new TextEncoder().encode(unescape(content)) };
});

Given('an uploaded file {string} with binary bytes', function (this: World, name: string) {
  this.file = { name, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]) };
});

Given('an uploaded file {string} of {int} bytes', function (this: World, name: string, size: number) {
  this.file = { name, bytes: new Uint8Array(size).fill(97) };
});

// Mirrors the screen: an upload is decoded first, then goes through the same pipeline as pasted text.
When('the transcript is processed', function (this: World) {
  if (this.file) {
    const decoded = decodeTranscriptFile(this.file.name, this.file.bytes);
    this.file = undefined;
    if (!decoded.ok) {
      this.outcome = { status: 'rejected', error: decoded.error };
      return;
    }
    this.raw = decoded.value;
    this.source = 'upload';
  }
  this.outcome = processTranscript(this.raw, this.source);
});

function accepted(world: World): TranscriptPayload {
  assert.equal(world.outcome?.status, 'accepted', `expected accepted, got ${JSON.stringify(world.outcome)}`);
  return (world.outcome as Extract<TranscriptOutcome, { status: 'accepted' }>).payload;
}

Then('it is accepted with source {string}', function (this: World, source: string) {
  assert.equal(accepted(this).source, source);
});

Then('the speakers are {string}', function (this: World, list: string) {
  assert.deepEqual(accepted(this).speakers, list.split(', '));
});

Then('it has {int} lines of conversation', function (this: World, n: number) {
  assert.equal(accepted(this).stats.dialogueTurns, n);
});

Then('the transcript is {string}', function (this: World, expected: string) {
  assert.equal(accepted(this).transcript, unescape(expected));
});

Then('the payload has a UUID id and an ISO 8601 receivedAt timestamp', function (this: World) {
  const p = accepted(this);
  assert.match(p.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Date(p.receivedAt).toISOString(), p.receivedAt);
});

Then('the label is exactly {string}', function (this: World, expected: string) {
  assert.equal(accepted(this).disclaimer, expected);
});

Then('it is rejected with code {string}', function (this: World, code: string) {
  assert.equal(this.outcome?.status, 'rejected', `expected rejected, got ${this.outcome?.status}`);
  if (this.outcome?.status === 'rejected') assert.equal(this.outcome.error.code, code);
});

Then('the error message does not contain {string}', function (this: World, marker: string) {
  if (this.outcome?.status !== 'rejected') assert.fail('expected a rejected outcome');
  assert.ok(!this.outcome.error.message.includes(marker));
});

Then('it is routed to the crisis path', function (this: World) {
  assert.deepEqual(this.outcome, { status: 'crisis' });
});

Then('no payload is built', function (this: World) {
  assert.ok(!this.outcome || !('payload' in this.outcome));
});
