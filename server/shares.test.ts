import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createShare, fetchSharedBrief, listShares, shareStatus, stopAllShares, stopShare, type Recipient } from '../src/lib/sharesApi.js';
import type { BriefSnapshot } from '../src/lib/types.js';
import { CRISIS_HELP, createApp } from './app.js';
import type { AuthConfig } from './auth.js';
import { hashToken, memoryShareStore } from './shares/store.js';

const auth: AuthConfig = {
  required: true,
  verifyToken: async (t) => (t === 'alice.token' ? { id: 'alice' } : t === 'bob.token' ? { id: 'bob' } : null),
};

const brief = (): BriefSnapshot => ({
  who: 'Theo, 30 · Visit Nov 14',
  priorities: ['Sleepiness since the dose change', 'Dizzy when I stand up'],
  symptoms: [{ label: 'Reported', clinical: 'Over-sedation / excessive daytime somnolence', quote: 'The meds make me a zombie' }],
  tried: 'Ziprasidone 40 mg for 5 weeks',
  timeline: [{ date: '2026-10-01', detail: 'Dose went up' }],
  askingFor: ['Check blood pressure standing up'],
  demo: true,
});

const pcp: Recipient = { name: 'Dr. Lane', role: 'Primary care', email: 'Lane@Clinic.example', clinic: 'Riverside Clinic' };
const therapist: Recipient = { name: 'Sam Ortiz', role: 'Therapist', email: 'sam@therapy.example', clinic: '' };

function setup() {
  const store = memoryShareStore();
  const app = createApp({ auth, shares: store });
  const as = (who: 'alice' | 'bob') => ({
    post: (path: string, body: unknown) => request(app).post(path).set('Authorization', `Bearer ${who}.token`).send(body as object),
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${who}.token`),
    del: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${who}.token`),
  });
  const share = async (recipient: Recipient, who: 'alice' | 'bob' = 'alice', days = 7) => {
    const res = await as(who).post('/api/shares', { brief: brief(), recipient, days });
    expect(res.status).toBe(201);
    return { id: res.body.share.id as string, path: res.body.path as string };
  };
  const doctor = (path: string) => request(app).get(`/api${path}`);
  return { app, store, as, share, doctor };
}

describe('POST /api/shares: one link per person', () => {
  it('creates a link for one person and returns the path once', async () => {
    const { as } = setup();
    const res = await as('alice').post('/api/shares', { brief: brief(), recipient: pcp, days: 7 });
    expect(res.status).toBe(201);
    expect(res.body.path).toMatch(/^\/shared\/[A-Za-z0-9_-]{43}$/);
    expect(res.body.share.recipient).toEqual({ name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example', clinic: 'Riverside Clinic' });
    expect(res.body.trimmed).toBe(false);
    const expires = new Date(res.body.share.expiresAt).getTime() - Date.now();
    expect(expires).toBeGreaterThan(6.9 * 86_400_000);
    expect(expires).toBeLessThanOrEqual(7 * 86_400_000);
  });

  it('fits the brief to one page and says it trimmed', async () => {
    const { as } = setup();
    const long = { ...brief(), priorities: ['a', 'b', 'c', 'd', 'e'], symptoms: [{ label: 'Reported', clinical: 'x', quote: 'q'.repeat(1000) }] };
    const res = await as('alice').post('/api/shares', { brief: long, recipient: pcp, days: 1 });
    expect(res.body.trimmed).toBe(true);
  });

  it('does not share a brief with crisis language, and stores nothing', async () => {
    const { as } = setup();
    const res = await as('alice').post('/api/shares', { brief: { ...brief(), priorities: ['I want to hurt myself'] }, recipient: pcp, days: 7 });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
    expect((await as('alice').get('/api/shares')).body.shares).toEqual([]);
  });

  it.each([
    ['a missing recipient', { brief: brief(), days: 7 }],
    ['an email without @', { brief: brief(), recipient: { ...pcp, email: 'lane.clinic' }, days: 7 }],
    ['an email with a line break', { brief: brief(), recipient: { ...pcp, email: 'a@b.co\nBcc: x@y.z' }, days: 7 }],
    ['an unknown role', { brief: brief(), recipient: { ...pcp, role: 'Friend' }, days: 7 }],
    ['a blank name', { brief: brief(), recipient: { ...pcp, name: '  ' }, days: 7 }],
    ['0 days', { brief: brief(), recipient: pcp, days: 0 }],
    ['31 days', { brief: brief(), recipient: pcp, days: 31 }],
    ['1.5 days', { brief: brief(), recipient: pcp, days: 1.5 }],
    ['a brief with the wrong shape', { brief: { priorities: 'all of it' }, recipient: pcp, days: 7 }],
  ])('rejects %s (400 INVALID_SHARE)', async (_name, body) => {
    const { as } = setup();
    const res = await as('alice').post('/api/shares', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SHARE');
  });

  it('rejects an empty brief (400 EMPTY_BRIEF)', async () => {
    const { as } = setup();
    const res = await as('alice').post('/api/shares', { brief: { who: 'Theo', priorities: [], symptoms: [], tried: 'Not discussed', timeline: [], askingFor: [], demo: false }, recipient: pcp, days: 7 });
    expect(res.body.error.code).toBe('EMPTY_BRIEF');
  });

  it('requires sign-in (401) and a configured store (503)', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/shares').send({ brief: brief(), recipient: pcp, days: 7 })).status).toBe(401);
    const noStore = createApp({ auth });
    const res = await request(noStore).post('/api/shares').set('Authorization', 'Bearer alice.token').send({ brief: brief(), recipient: pcp, days: 7 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SHARING_NOT_CONFIGURED');
  });

  it('never logs the brief or the recipient', async () => {
    const { as } = setup();
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    await as('alice').post('/api/shares', { brief: { ...brief(), priorities: ['PATIENT-SECRET'] }, recipient: { ...pcp, email: 'secret-doc@x.example' }, days: 7 });
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toMatch(/PATIENT-SECRET|secret-doc/);
    spies.forEach((s) => s.mockRestore());
  });
});

describe('GET /api/shared/:token: the doctor opens the link', () => {
  it('shows the brief without sign-in, never indexed', async () => {
    const { share, doctor } = setup();
    const { path } = await share(pcp);
    const res = await doctor(path);
    expect(res.status).toBe(200);
    expect(res.body.brief.priorities).toEqual(brief().priorities);
    expect(res.body.sharedWith).toEqual({ name: 'Dr. Lane', role: 'Primary care' });
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toContain('lane@clinic.example');
  });

  it.each([
    ['an unknown token', `/shared/${'A'.repeat(43)}`],
    ['a malformed token', '/shared/not-a-token'],
  ])('says not found for %s (404)', async (_name, path) => {
    const res = await setup().doctor(path);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LINK_NOT_FOUND');
  });

  it('says expired once the time is up (410)', async () => {
    const { store, doctor } = setup();
    const token = 'B'.repeat(43);
    await store.create('alice', { ...pcp, email: 'lane@clinic.example' }, brief(), hashToken(token), new Date(Date.now() - 1000));
    const res = await doctor(`/shared/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('LINK_EXPIRED');
  });
});

describe('Stop sharing: per person, per account', () => {
  it('stopping one person leaves everyone else’s link working', async () => {
    const { as, share, doctor } = setup();
    const lane = await share(pcp);
    const sam = await share(therapist);
    expect((await as('alice').del(`/api/shares/${lane.id}`)).status).toBe(204);
    expect((await doctor(lane.path)).body.error.code).toBe('LINK_STOPPED');
    expect((await doctor(sam.path)).status).toBe(200);
  });

  it('lists each person separately, newest first, without tokens', async () => {
    const { as, share } = setup();
    const lane = await share(pcp);
    await share(therapist);
    await as('alice').del(`/api/shares/${lane.id}`);
    const res = await as('alice').get('/api/shares');
    expect(res.body.shares.map((s: { recipient: { name: string } }) => s.recipient.name)).toEqual(['Sam Ortiz', 'Dr. Lane']);
    expect(res.body.shares.map(shareStatus)).toEqual(['active', 'stopped']);
    expect(JSON.stringify(res.body)).not.toMatch(/shared\/|token/i);
  });

  it('stop all ends every link', async () => {
    const { as, share, doctor } = setup();
    const a = await share(pcp);
    const b = await share(therapist);
    expect((await as('alice').del('/api/shares')).body).toEqual({ status: 'ok', stopped: 2 });
    expect((await doctor(a.path)).status).toBe(410);
    expect((await doctor(b.path)).status).toBe(410);
  });

  it('one patient can never see or stop another patient’s links', async () => {
    const { as, share, doctor } = setup();
    const alices = await share(pcp, 'alice');
    expect((await as('bob').get('/api/shares')).body.shares).toEqual([]);
    expect((await as('bob').del(`/api/shares/${alices.id}`)).status).toBe(404);
    expect((await as('bob').del('/api/shares')).body.stopped).toBe(0);
    expect((await doctor(alices.path)).status).toBe(200);
  });

  it('deleting the account ends every link (database cascade)', async () => {
    const { store, share, doctor } = setup();
    const a = await share(pcp);
    const b = await share(therapist);
    store.deleteUser('alice'); // what ON DELETE CASCADE from auth.users does
    expect((await doctor(a.path)).status).toBe(404);
    expect((await doctor(b.path)).status).toBe(404);
  });
});

describe('sharesApi (browser client + real Express app)', () => {
  const clientFor = (app: ReturnType<typeof createApp>, who = 'alice'): typeof fetch => async (url, init) => {
    const method = (init?.method ?? 'GET').toLowerCase() as 'get' | 'post' | 'delete';
    let req = request(app)[method](String(url));
    const headers = { ...((init?.headers ?? {}) as Record<string, string>) };
    if (!String(url).startsWith('/api/shared/')) headers.Authorization = `Bearer ${who}.token`;
    req = req.set(headers);
    const r = init?.body ? await req.send(String(init.body)) : await req;
    return new Response(r.status === 204 ? null : r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('creates, lists, opens and stops a link', async () => {
    const { app } = setup();
    const fetchImpl = clientFor(app);
    const made = await createShare({ brief: brief(), recipient: pcp, days: 7 }, { fetchImpl, origin: 'https://app.example' });
    expect(made.status).toBe('ok');
    if (made.status !== 'ok') return;
    expect(made.url).toMatch(/^https:\/\/app\.example\/shared\/[A-Za-z0-9_-]{43}$/);
    const token = made.url.split('/shared/')[1];

    expect(await listShares({ fetchImpl })).toMatchObject({ status: 'ok', shares: [{ id: made.share.id }] });
    expect(await fetchSharedBrief(token, { fetchImpl })).toMatchObject({ status: 'ok', sharedWith: { name: 'Dr. Lane' } });
    expect(await stopShare(made.share.id, { fetchImpl })).toEqual({ status: 'ok', stopped: 1 });
    expect(await fetchSharedBrief(token, { fetchImpl })).toEqual({ status: 'stopped' });
    expect(await stopAllShares({ fetchImpl })).toEqual({ status: 'ok', stopped: 0 });
  });

  it('reports crisis, rejections, missing links and the server being down', async () => {
    const { app } = setup();
    const fetchImpl = clientFor(app);
    expect(await createShare({ brief: { ...brief(), askingFor: ["I don't want to be here anymore"] }, recipient: pcp, days: 7 }, { fetchImpl })).toEqual({ status: 'crisis' });
    expect(await createShare({ brief: brief(), recipient: { ...pcp, email: 'nope' }, days: 7 }, { fetchImpl })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_SHARE' } });
    expect(await fetchSharedBrief('C'.repeat(43), { fetchImpl })).toEqual({ status: 'missing' });
    const offline: typeof fetch = async () => { throw new TypeError('offline'); };
    expect((await listShares({ fetchImpl: offline })).status).toBe('unavailable');
    expect(await listShares({ fetchImpl: clientFor(app, 'nobody') })).toMatchObject({ status: 'rejected', error: { code: 'UNAUTHORIZED' } });
  });
});
