/**
 * Logging in as Theo, the shared demo account (ADR-010): his record loads, and nothing he does can affect
 * the next person who demos (no deleting the account, no share links visible to everyone).
 */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { BriefSnapshot } from '../src/lib/types.js';
import { createApp } from './app.js';
import type { AuthConfig } from './auth.js';
import { shiftDates } from './demo/publicDemo.js';
import { memoryDemoSource } from './demo/source.js';
import { buildTheoRecord } from './demo/theoRecord.js';
import { memoryShareStore } from './shares/store.js';

const theoRecord = { data: buildTheoRecord(), anchorDate: '2026-11-01' };
const realRecord = { data: { profile: { name: 'Ana' }, visits: [{ id: 'v', date: '2026-11-01' }] }, anchorDate: '2026-11-01' };

function setup() {
  const deleteUser = vi.fn(async () => true);
  const auth: AuthConfig = {
    required: true,
    verifyToken: async (t) =>
      t === 'theo' ? { id: 'theo-id', email: 'theo.demo@example.com', role: 'public-demo' }
      : t === 'ana' ? { id: 'ana-id', email: 'ana@example.com' }
      : t === 'new' ? { id: 'new-id', email: 'new@example.com' }
      : null,
    admin: { deleteUser },
  };
  const app = createApp({
    auth,
    demo: memoryDemoSource(theoRecord, { 'theo-id': theoRecord, 'ana-id': realRecord }),
    shares: memoryShareStore(),
    today: () => '2026-11-13',
  });
  const as = (who: string) => ({
    get: (p: string) => request(app).get(p).set('Authorization', `Bearer ${who}`),
    post: (p: string, b: unknown) => request(app).post(p).set('Authorization', `Bearer ${who}`).send(b as object),
    del: (p: string) => request(app).delete(p).set('Authorization', `Bearer ${who}`),
  });
  return { app, as, deleteUser };
}

const brief: BriefSnapshot = { who: 'Theo', priorities: ['Sleepiness'], symptoms: [], tried: 'Not discussed', timeline: [], askingFor: [], demo: true };
const share = { brief, recipient: { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example' }, days: 7 };

describe('GET /api/me/app-data', () => {
  it('logging in as Theo returns his record, dates moved to today, with his own email', async () => {
    const res = await setup().as('theo').get('/api/me/app-data');
    expect(res.status).toBe(200);
    expect(res.body.isDemoAccount).toBe(true);
    expect(res.body.data.profile).toMatchObject({ name: 'Theo', lastName: 'Marsh', email: 'theo.demo@example.com' });
    const stored = (theoRecord.data.visits as { date: string }[]).map((v) => v.date);
    expect((res.body.data.visits as { date: string }[]).map((v) => v.date)).toEqual(stored.map((d) => shiftDates(d, 12)));
    expect(res.body.data.visits.some((v: { recap?: unknown }) => v.recap)).toBe(true);
  });

  it('a real user’s own record is not date-shifted and not marked demo', async () => {
    const res = await setup().as('ana').get('/api/me/app-data');
    expect(res.body.isDemoAccount).toBe(false);
    expect(res.body.data.visits[0].date).toBe('2026-11-01');
  });

  it('a user without a server record gets 404 (the normal setup runs)', async () => {
    expect((await setup().as('new').get('/api/me/app-data')).body.error.code).toBe('NO_APP_DATA');
  });

  it('only ever returns the signed-in user’s own record', async () => {
    const res = await setup().as('ana').get('/api/me/app-data');
    expect(JSON.stringify(res.body)).not.toMatch(/Theo|Marsh|Dr\. Lane/);
  });

  it('requires sign-in (401)', async () => {
    expect((await request(setup().app).get('/api/me/app-data')).status).toBe(401);
  });
});

describe('the shared demo account can’t affect others', () => {
  it('can’t delete the account (403), and the delete never reaches the server', async () => {
    const { as, deleteUser } = setup();
    const res = await as('theo').del('/api/account');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DEMO_ACCOUNT_READ_ONLY');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('can’t create doctor share links (403); a real user can (201)', async () => {
    const { as } = setup();
    expect((await as('theo').post('/api/shares', share)).status).toBe(403);
    expect((await as('ana').post('/api/shares', share)).status).toBe(201);
  });

  it('a real user can still delete their own account', async () => {
    const { as, deleteUser } = setup();
    expect((await as('ana').del('/api/account')).status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith('ana-id');
  });
});
