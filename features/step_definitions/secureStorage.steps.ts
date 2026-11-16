import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { recordKeysFromEnv } from '../../server/records/crypto.js';
import { encryptedRecordService } from '../../server/records/service.js';
import { memoryRecordStore } from '../../server/records/store.js';

interface World {
  ssStore?: ReturnType<typeof memoryRecordStore>;
  ssApp?: ReturnType<typeof createApp>;
  ssWho?: string;
  ssLast?: request.Response;
}

const ssAuth = {
  required: true,
  verifyToken: async (t: string) => (t === 'sam' ? { id: 'sam' } : t === 'riley' ? { id: 'riley' } : t === 'theo' ? { id: 'theo', role: 'public-demo' } : null),
};
const record = (detail: string) => ({ profile: { name: 'Sam' }, evidence: [{ id: 'e1', date: '2026-11-01', type: 'symptom', title: 'Symptom', detail }] });
const put = (w: World, who: string, body: unknown) => request(w.ssApp!).put('/api/me/record').set('Authorization', `Bearer ${who}`).send(body as object);
const get = (w: World, who: string) => request(w.ssApp!).get('/api/me/record').set('Authorization', `Bearer ${who}`);

function signIn(w: World, who: string, withKey: boolean) {
  w.ssStore = memoryRecordStore();
  w.ssWho = who;
  const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!;
  w.ssApp = createApp({ auth: ssAuth, records: withKey ? encryptedRecordService(w.ssStore, keys) : undefined });
}

Given('Sam is signed in and server backup is set up', function (this: World) { signIn(this, 'sam', true); });
Given('Theo is signed in and server backup is set up', function (this: World) { signIn(this, 'theo', true); });
Given('Sam is signed in but no encryption key is set', function (this: World) { signIn(this, 'sam', false); });

When('Sam saves a record with the note {string}', async function (this: World, note: string) {
  this.ssLast = await put(this, 'sam', { record: record(note), baseVersion: 0 });
});
When('Theo saves a record with the note {string}', async function (this: World, note: string) {
  this.ssLast = await put(this, 'theo', { record: record(note), baseVersion: 0 });
});
When('Sam saves a record that includes a password hash and a share link', async function (this: World) {
  this.ssLast = await put(this, 'sam', { record: { profile: { name: 'Sam', passwordHash: { salt: 's', hash: 'h' } }, shareLinks: [{ id: 'l', token: 'tok' }] }, baseVersion: 0 });
});
Given('Sam has saved twice from the phone', async function (this: World) {
  await put(this, 'sam', { record: record('one'), baseVersion: 0 });
  await put(this, 'sam', { record: record('two'), baseVersion: 1 });
});
When("Sam's laptop saves based on the first version", async function (this: World) {
  this.ssLast = await put(this, 'sam', { record: record('laptop'), baseVersion: 1 });
});

Then('Sam gets the record back with the note {string}', async function (this: World, note: string) {
  const res = await get(this, 'sam');
  assert.equal(res.status, 200);
  assert.equal(res.body.record.evidence[0].detail, note);
});
Then('the stored row does not contain {string}', function (this: World, text: string) {
  assert.ok(!JSON.stringify(this.ssStore!.rows.get('sam')).includes(text));
});
Then('Riley gets no record', async function (this: World) {
  assert.equal((await get(this, 'riley')).status, 404);
});
Then('the record Sam gets back has no password hash and no share links', async function (this: World) {
  const { record: r } = (await get(this, 'sam')).body;
  assert.equal(r.profile.passwordHash, undefined);
  assert.equal(r.shareLinks, undefined);
});
Then('the save is refused as a conflict with the newer record', function (this: World) {
  assert.equal(this.ssLast!.status, 409);
  assert.equal(this.ssLast!.body.current.record.evidence[0].detail, 'two');
});
Then('the answer is {string}', function (this: World, code: string) {
  assert.equal(this.ssLast!.body.error?.code, code);
});
