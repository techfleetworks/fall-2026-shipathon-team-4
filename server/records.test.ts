import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { AuthConfig } from './auth.js';
import { recordKeysFromEnv } from './records/crypto.js';
import { MAX_LIST_ITEMS, parseSavedRecord } from './records/record.js';
import { encryptedRecordService, recordServiceFromEnv } from './records/service.js';
import { memoryRecordStore } from './records/store.js';

const auth: AuthConfig = {
  required: true,
  verifyToken: async (t) =>
    t === 'alice.token' ? { id: 'alice' } : t === 'bob.token' ? { id: 'bob' } : t === 'theo.token' ? { id: 'theo', role: 'public-demo' } : null,
};

function setup() {
  const store = memoryRecordStore();
  const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!;
  const app = createApp({ auth, records: encryptedRecordService(store, keys) });
  const as = (who: string) => ({
    get: () => request(app).get('/api/me/record').set('Authorization', `Bearer ${who}.token`),
    put: (body: unknown) => request(app).put('/api/me/record').set('Authorization', `Bearer ${who}.token`).send(body as object),
    del: () => request(app).delete('/api/me/record').set('Authorization', `Bearer ${who}.token`),
  });
  return { store, as };
}

const RECORD = {
  profile: { name: 'Sam', onboarded: true, passwordHash: { salt: 's', hash: 'h' }, email: 'sam@example.com' },
  evidence: [{ id: 'e1', date: '2026-11-01', type: 'symptom', title: 'Symptom', detail: 'Dizzy when I stand up' }],
  visits: [{ id: 'v1', date: '2026-11-03', priorities: ['Dizzy'], askingFor: [] }],
  shareLinks: [{ id: 's1', token: 'secret-token' }],
  signedIn: true,
  demoMode: false,
  savedScripts: ['dismiss-depression'],
  textScale: 1.2,
};

describe('/api/me/record (encrypted Visit store)', () => {
  it('saves, then returns the record to its owner, without the password hash, email, share links or session flags', async () => {
    const { as } = setup();
    const saved = await as('alice').put({ record: RECORD, baseVersion: 0 });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ status: 'ok', version: 1 });
    const got = await as('alice').get();
    expect(got.status).toBe(200);
    expect(got.body.version).toBe(1);
    expect(got.body.record).toEqual({
      profile: { name: 'Sam', onboarded: true },
      evidence: RECORD.evidence,
      visits: RECORD.visits,
      savedScripts: ['dismiss-depression'],
      textScale: 1.2,
    });
  });

  it('what is stored is encrypted: no health words, names or tokens in the stored row', async () => {
    const { as, store } = setup();
    await as('alice').put({ record: RECORD, baseVersion: 0 });
    const row = JSON.stringify(store.rows.get('alice'));
    expect(row).not.toMatch(/Dizzy|Sam|secret-token|symptom/i);
  });

  it('each person only ever sees their own record', async () => {
    const { as } = setup();
    await as('alice').put({ record: RECORD, baseVersion: 0 });
    expect((await as('bob').get()).status).toBe(404);
  });

  it('versions: a save from an out-of-date device is refused with the current record, nothing overwritten', async () => {
    const { as } = setup();
    await as('alice').put({ record: RECORD, baseVersion: 0 }); // v1
    await as('alice').put({ record: { ...RECORD, textScale: 1.5 }, baseVersion: 1 }); // v2 (phone)
    const stale = await as('alice').put({ record: { ...RECORD, textScale: 2 }, baseVersion: 1 }); // laptop, still on v1
    expect(stale.status).toBe(409);
    expect(stale.body.status).toBe('conflict');
    expect(stale.body.current.version).toBe(2);
    expect(stale.body.current.record.textScale).toBe(1.5);
    expect((await as('alice').get()).body.record.textScale).toBe(1.5);
  });

  it('a second "first save" is a conflict, not an overwrite', async () => {
    const { as } = setup();
    await as('alice').put({ record: RECORD, baseVersion: 0 });
    expect((await as('alice').put({ record: {}, baseVersion: 0 })).status).toBe(409);
  });

  it('delete removes the server copy; deleting again is 404', async () => {
    const { as } = setup();
    await as('alice').put({ record: RECORD, baseVersion: 0 });
    expect((await as('alice').del()).status).toBe(204);
    expect((await as('alice').get()).status).toBe(404);
    expect((await as('alice').del()).status).toBe(404);
  });

  it("Theo (the shared demo account) can't save or delete", async () => {
    const { as } = setup();
    expect((await as('theo').put({ record: RECORD, baseVersion: 0 })).body.error.code).toBe('DEMO_ACCOUNT_READ_ONLY');
    expect((await as('theo').del()).status).toBe(403);
  });

  it('needs sign-in (401)', async () => {
    const { as } = setup();
    expect((await as('nobody').get()).status).toBe(401);
    expect((await as('nobody').put({ record: {}, baseVersion: 0 })).status).toBe(401);
  });

  it('is off, not insecure, when no key or database is configured (503)', async () => {
    const app = createApp({ auth, records: undefined });
    const res = await request(app).get('/api/me/record').set('Authorization', 'Bearer alice.token');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('RECORD_STORE_NOT_CONFIGURED');
  });

  it.each([
    ['no record', { baseVersion: 0 }],
    ['a record that is a list', { record: [], baseVersion: 0 }],
    ['no base version', { record: {} }],
    ['a negative base version', { record: {}, baseVersion: -1 }],
    ['a fractional base version', { record: {}, baseVersion: 1.5 }],
    ['an entry without an id', { record: { evidence: [{ date: '2026-11-01' }] }, baseVersion: 0 }],
    ['a list that is not a list', { record: { visits: 'x' }, baseVersion: 0 }],
    ['too many entries', { record: { evidence: Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => ({ id: `e${i}` })) }, baseVersion: 0 }],
    ['a record over 512 KB', { record: { evidence: [{ id: 'big', detail: 'a'.repeat(600 * 1024) }] }, baseVersion: 0 }],
    ['a strange text size', { record: { textScale: 99 }, baseVersion: 0 }],
  ])('rejects %s (400 INVALID_RECORD)', async (_n, body) => {
    const { as } = setup();
    const res = await as('alice').put(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RECORD');
  });

  it('rejects a body that is not JSON (415) and other methods (405)', async () => {
    const app = createApp({ auth, records: encryptedRecordService(memoryRecordStore(), recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!) });
    const asAlice = (r: request.Test) => r.set('Authorization', 'Bearer alice.token');
    expect((await asAlice(request(app).post('/api/me/record')).send({})).status).toBe(405);
    expect((await asAlice(request(app).put('/api/me/record')).set('Content-Type', 'text/plain').send('hi')).status).toBe(415);
  });

  it('a stored row that fails to decrypt is a server error, never garbage data', async () => {
    const { as, store } = setup();
    await as('alice').put({ record: RECORD, baseVersion: 0 });
    const row = store.rows.get('alice')!;
    store.rows.set('bob', row); // Alice's encrypted row copied onto Bob's id
    const res = await as('bob').get();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/Dizzy|Sam/);
  });
});

describe('recordServiceFromEnv: fails closed', () => {
  const DB = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
  it.each([
    ['no encryption key', { ...DB }],
    ['a malformed key', { ...DB, RECORD_ENCRYPTION_KEY: 'short' }],
    ['a key but no database', { RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') }],
  ])('is off with %s (records are never stored unencrypted)', (_n, env) => {
    expect(recordServiceFromEnv(env)).toBeUndefined();
  });
  it('is on with a database and a valid key', () => {
    expect(recordServiceFromEnv({ ...DB, RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })).toBeDefined();
  });
});

describe('parseSavedRecord', () => {
  it('keeps an empty record (a new user)', () => {
    expect(parseSavedRecord({})).toEqual({});
  });
  it('drops unknown fields', () => {
    expect(parseSavedRecord({ hacked: true, evidence: [] })).toEqual({ evidence: [] });
  });
});
