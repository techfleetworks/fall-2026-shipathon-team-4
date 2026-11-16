import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import { memoryShareStore } from '../../server/shares/store.js';
import type { BriefSnapshot } from '../../src/lib/types.js';

interface World {
  store: ReturnType<typeof memoryShareStore>;
  app: ReturnType<typeof createApp>;
  links: Map<string, { id: string; path: string }>;
  last?: request.Response;
}

const brief = (priority = 'Sleepiness since the dose change'): BriefSnapshot => ({
  who: 'Alice',
  priorities: [priority],
  symptoms: [{ label: 'Reported', clinical: 'Over-sedation / excessive daytime somnolence' }],
  tried: 'Not discussed',
  timeline: [],
  askingFor: [],
  demo: true,
});

Given('Alice is signed in', function (this: World) {
  this.store = memoryShareStore();
  this.links = new Map();
  this.app = createApp({
    shares: this.store,
    auth: { required: true, verifyToken: async (t) => (t === 'alice' ? { id: 'alice' } : t === 'bob' ? { id: 'bob' } : null) },
  });
});

async function shareWith(w: World, name: string, role: string, email: string, days: number) {
  const res = await request(w.app).post('/api/shares').set('Authorization', 'Bearer alice').send({ brief: brief(), recipient: { name, role, email }, days });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  w.links.set(name, { id: res.body.share.id, path: res.body.path });
}

Given('Alice shares her brief with {string} \\({word} {word}, {string}) for {int} days', async function (this: World, name: string, w1: string, w2: string, email: string, days: number) {
  await shareWith(this, name, `${w1} ${w2}`, email, days);
});

Given('Alice shares her brief with {string} \\({word}, {string}) for {int} days', async function (this: World, name: string, role: string, email: string, days: number) {
  await shareWith(this, name, role, email, days);
});

When('Alice stops sharing with {string}', async function (this: World, name: string) {
  const res = await request(this.app).delete(`/api/shares/${this.links.get(name)!.id}`).set('Authorization', 'Bearer alice');
  assert.equal(res.status, 204);
});

When('Alice deletes her account', function (this: World) {
  this.store.deleteUser('alice'); // what ON DELETE CASCADE from auth.users does in Supabase
});

When('Bob tries to stop Alice\'s link', async function (this: World) {
  const [first] = [...this.links.values()];
  this.last = await request(this.app).delete(`/api/shares/${first.id}`).set('Authorization', 'Bearer bob');
});

When('Alice tries to share a brief that says {string}', async function (this: World, text: string) {
  this.last = await request(this.app).post('/api/shares').set('Authorization', 'Bearer alice').send({ brief: brief(text), recipient: { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example' }, days: 7 });
});

When('someone opens a link that was never shared', async function (this: World) {
  this.last = await request(this.app).get(`/api/shared/${'Z'.repeat(43)}`);
});

const open = (w: World, name: string) => request(w.app).get(`/api${w.links.get(name)!.path}`);

Then('the doctor\'s link shows Alice\'s brief without signing in', async function (this: World) {
  const res = await open(this, 'Dr. Lane');
  assert.equal(res.status, 200);
  assert.equal(res.body.brief.who, 'Alice');
});

Then('the link for {string} says the patient stopped sharing', async function (this: World, name: string) {
  const res = await open(this, name);
  assert.equal(res.status, 410);
  assert.equal(res.body.error.code, 'LINK_STOPPED');
});

Then('the link for {string} still shows the brief', async function (this: World, name: string) {
  assert.equal((await open(this, name)).status, 200);
});

Then('no link opens anymore', async function (this: World) {
  for (const name of this.links.keys()) assert.equal((await open(this, name)).status, 404);
});

Then('Bob is told the link isn\'t in his account', function (this: World) {
  assert.equal(this.last?.status, 404);
  assert.equal(this.last?.body.error.code, 'SHARE_NOT_FOUND');
});

Then('she is shown crisis support and nothing is shared', async function (this: World) {
  assert.equal(this.last?.body.status, 'crisis');
  const list = await request(this.app).get('/api/shares').set('Authorization', 'Bearer alice');
  assert.deepEqual(list.body.shares, []);
});

Then('they are told the link can\'t be found', function (this: World) {
  assert.equal(this.last?.status, 404);
  assert.equal(this.last?.body.error.code, 'LINK_NOT_FOUND');
});
