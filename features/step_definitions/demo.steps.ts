import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { shiftDates } from '../../server/demo/publicDemo.js';
import { memoryDemoSource } from '../../server/demo/source.js';
import { buildTheoRecord } from '../../server/demo/theoRecord.js';
import { memoryShareStore } from '../../server/shares/store.js';

interface World {
  record: Record<string, unknown> | null;
  res?: request.Response;
}

const TODAY = '2026-11-13';
const SAVED = '2026-11-01';

Given('Theo\'s record was saved on the server {int} days ago', function (this: World, _days: number) {
  this.record = buildTheoRecord();
});

Given('Theo\'s stored record also holds an email, a password hash and a share link', function (this: World) {
  const r = this.record!;
  this.record = { ...r, profile: { ...(r.profile as object), email: 'theo@leak.example', passwordHash: { salt: 'SALT', hash: 'HASH' } }, shareLinks: [{ token: 'LEAKTOKEN' }] };
});

Given('no demo record is set up on the server', function (this: World) {
  this.record = null;
});

const app = (w: World) => createApp({ demo: memoryDemoSource(w.record ? { data: w.record, anchorDate: SAVED } : null), today: () => TODAY });

When('a visitor opens the demo', async function (this: World) {
  this.res = await request(app(this)).get('/api/demo');
});

When('a visitor tries to write to the demo', async function (this: World) {
  this.res = await request(app(this)).put('/api/demo').send({ profile: { name: 'Mallory' } });
});

Then('they see Theo\'s visits with Dr. Lane', function (this: World) {
  assert.equal(this.res?.status, 200);
  assert.equal(this.res?.body.data.profile.name, 'Theo');
  assert.ok((this.res?.body.data.visits as { clinician: string }[]).every((v) => v.clinician === 'Dr. Lane'));
});

Then('his last visit\'s recap shows what Dr. Lane said, in plain words', function (this: World) {
  const recap = (this.res?.body.data.visits as { recap?: { doctorSaid: string[]; source: string } }[]).find((v) => v.recap)?.recap;
  assert.equal(recap?.source, 'transcript');
  assert.ok(recap?.doctorSaid.includes('The doctor thinks this is from the depression.'));
});

Then('it is labelled {string}', function (this: World, label: string) {
  assert.equal(this.res?.body.label, label);
});

Then('every date in Theo\'s record has moved forward {int} days', function (this: World, days: number) {
  const stored = (this.record!.visits as { date: string }[]).map((v) => v.date);
  const served = (this.res?.body.data.visits as { date: string }[]).map((v) => v.date);
  assert.deepEqual(served, stored.map((d) => shiftDates(d, days)));
});

Then('the response contains none of them', function (this: World) {
  assert.equal(this.res?.status, 200);
  const text = JSON.stringify(this.res?.body);
  for (const secret of ['theo@leak.example', 'SALT', 'HASH', 'LEAKTOKEN', 'passwordHash', 'shareLinks']) assert.ok(!text.includes(secret), `${secret} leaked`);
});

Then('the server refuses with {string}', function (this: World, _msg: string) {
  assert.equal(this.res?.status, 405);
});

Then('the server says the demo isn\'t set up', function (this: World) {
  assert.equal(this.res?.status, 404);
  assert.equal(this.res?.body.error.code, 'DEMO_NOT_SET_UP');
});

// ---- logging in as Theo (the shared demo account)

interface LoginWorld extends World {
  loginApp?: ReturnType<typeof createApp>;
  deleted?: boolean;
}

Given('someone is logged in as Theo', function (this: LoginWorld) {
  const record = { data: buildTheoRecord(), anchorDate: SAVED };
  this.deleted = false;
  this.loginApp = createApp({
    demo: memoryDemoSource(record, { 'theo-id': record }),
    shares: memoryShareStore(),
    today: () => TODAY,
    auth: {
      required: true,
      verifyToken: async (t) => (t === 'theo' ? { id: 'theo-id', email: 'theo.demo@example.com', role: 'public-demo' } : null),
      admin: { deleteUser: async () => { this.deleted = true; return true; } },
    },
  });
});

When('the app asks for his saved data', async function (this: LoginWorld) {
  this.res = await request(this.loginApp!).get('/api/me/app-data').set('Authorization', 'Bearer theo');
});

When('they try to delete the account', async function (this: LoginWorld) {
  this.res = await request(this.loginApp!).delete('/api/account').set('Authorization', 'Bearer theo');
});

When('they try to share the brief with a doctor', async function (this: LoginWorld) {
  this.res = await request(this.loginApp!).post('/api/shares').set('Authorization', 'Bearer theo').send({
    brief: { who: 'Theo', priorities: ['Sleepiness'], symptoms: [], tried: 'Not discussed', timeline: [], askingFor: [], demo: true },
    recipient: { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example' },
    days: 7,
  });
});

Then('it gets Theo\'s record with his visits and the transcript recap', function (this: LoginWorld) {
  assert.equal(this.res?.status, 200);
  assert.equal(this.res?.body.isDemoAccount, true);
  assert.ok((this.res?.body.data.visits as { recap?: unknown }[]).some((v) => v.recap));
});

Then('the server refuses because it is the shared demo account', function (this: LoginWorld) {
  assert.equal(this.res?.status, 403);
  assert.equal(this.res?.body.error.code, 'DEMO_ACCOUNT_READ_ONLY');
  assert.equal(this.deleted, false);
});

// ---- "Play Theo's visit"

When('a visitor plays Theo\'s visit and also sends the text {string}', async function (this: World, text: string) {
  const locked = createApp({ auth: { required: true, verifyToken: async () => null } });
  this.res = await request(locked).post('/api/demo/play-visit').send({ talkingPoints: [], transcript: text, notes: text });
});

Then('they get the plain summary of Theo\'s visit', function (this: World) {
  assert.equal(this.res?.status, 200);
  assert.ok(this.res?.body.summary.doctorSaid.includes('The doctor thinks this is from the depression.'));
});

Then('nothing they sent appears in it', function (this: World) {
  assert.ok(!/Evil|stop taking/.test(JSON.stringify(this.res?.body)));
});
