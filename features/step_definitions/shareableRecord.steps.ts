import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { buildTheoRecord } from '../../server/demo/theoRecord.js';
import { recordKeysFromEnv } from '../../server/records/crypto.js';
import { encryptedShareStore } from '../../server/shares/encrypted.js';
import { hashToken, memoryShareStore } from '../../server/shares/store.js';
import { buildCaseSnapshot } from '../../src/lib/caseView/snapshot.js';
import type { CaseInputs } from '../../src/lib/caseView/caseView.js';
import { todayISO } from '../../src/lib/dates.js';
import type { BriefSnapshot, CaseSnapshot } from '../../src/lib/types.js';

interface World {
  srInner?: ReturnType<typeof memoryShareStore>;
  srApp?: ReturnType<typeof createApp>;
  srPath?: string;
  srSeen?: request.Response;
  srLast?: request.Response;
}

const lane = { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example', clinic: 'Riverside Clinic' };
const theoCase = () => buildCaseSnapshot(buildTheoRecord() as unknown as CaseInputs, todayISO())!;
const brief = (c?: CaseSnapshot): BriefSnapshot => ({
  who: 'Theo, 30', priorities: ['Daytime sleepiness since the dose change'],
  symptoms: [{ label: 'Reported', clinical: 'Over-sedation / excessive daytime somnolence' }],
  tried: 'Ziprasidone, dose increased', timeline: [], askingFor: [], demo: true, ...(c ? { case: c } : {}),
});

function setup(w: World) {
  w.srInner = memoryShareStore();
  const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!;
  w.srApp = createApp({
    auth: { required: true, verifyToken: async (t) => (t === 'patient' ? { id: 'patient' } : null) },
    shares: encryptedShareStore(w.srInner, keys),
  });
}
const post = (w: World, b: BriefSnapshot) => request(w.srApp!).post('/api/shares').set('Authorization', 'Bearer patient').send({ brief: b, recipient: lane, days: 7 });

Given('the patient shares a brief with their case history with Dr. Lane', async function (this: World) {
  setup(this);
  this.srPath = (await post(this, brief(theoCase()))).body.path;
});
Given('the patient shares a brief without their case history with Dr. Lane', async function (this: World) {
  setup(this);
  this.srPath = (await post(this, brief())).body.path;
});
When('Dr. Lane opens the link', async function (this: World) {
  this.srSeen = await request(this.srApp!).get(`/api${this.srPath}`);
  assert.equal(this.srSeen.status, 200);
});
When('the patient tries to share a case history containing {string}', async function (this: World, text: string) {
  setup(this);
  this.srLast = await post(this, brief({ ...theoCase(), patterns: [text] }));
});

Then('Dr. Lane sees the pattern {string}', function (this: World, text: string) {
  assert.ok((this.srSeen!.body.brief.case.patterns as string[]).some((p) => p.includes(text)));
});
Then('Dr. Lane sees a past visit with {string}', function (this: World, who: string) {
  assert.ok((this.srSeen!.body.brief.case.visits as { clinician?: string }[]).some((v) => v.clinician === who));
});
Then('Dr. Lane sees no case history', function (this: World) {
  assert.equal(this.srSeen!.body.brief.case, undefined);
});
Then('the stored brief does not contain {string}', async function (this: World, text: string) {
  const stored = await this.srInner!.findByTokenHash(hashToken(this.srPath!.split('/').pop()!));
  assert.ok(!JSON.stringify(stored!.brief).includes(text));
});
Then('the answer is crisis support and nothing is shared', async function (this: World) {
  assert.equal(this.srLast!.body.status, 'crisis');
  const list = await request(this.srApp!).get('/api/shares').set('Authorization', 'Bearer patient');
  assert.deepEqual(list.body.shares, []);
});
