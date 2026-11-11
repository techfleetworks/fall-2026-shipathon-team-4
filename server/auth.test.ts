import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { THEO_SAMPLE_TRANSCRIPT } from '../src/data/sampleTranscript.js';
import { requestVisitSummary, setAccessTokenProvider, SIGNED_OUT_MESSAGE } from '../src/lib/api.js';
import { createApp } from './app.js';
import { authConfigFromEnv, type AuthConfig } from './auth.js';

// A stand-in for Supabase: one valid token, one user.
const GOOD = 'good.token.value';
const verifyToken = vi.fn(async (t: string) => (t === GOOD ? { id: 'user-123', email: 'theo@example.test' } : null));
const deleteUser = vi.fn(async (_id: string) => true);
const configured: AuthConfig = { verifyToken, admin: { deleteUser }, required: true };

const transcriptBody = { transcript: THEO_SAMPLE_TRANSCRIPT, source: 'sample', patientName: 'Theo' };

describe('sign-in required (Supabase configured)', () => {
  const app = createApp({ auth: configured });

  it.each(['/api/transcripts', '/api/visit-summary', '/api/prep-summary'])('refuses %s without a token (401)', async (path) => {
    const res = await request(app).post(path).send(path === '/api/prep-summary' ? { draft: { opening: 'tired' } } : transcriptBody);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a wrong or malformed token (401)', async () => {
    for (const header of ['Bearer nope', 'Bearer ', 'Basic abc', `Bearer ${'a'.repeat(5000)}`, 'Bearer a b']) {
      const res = await request(app).post('/api/visit-summary').set('Authorization', header).send(transcriptBody);
      expect(res.status).toBe(401);
    }
  });

  it('lets a signed-in user through', async () => {
    const res = await request(app).post('/api/visit-summary').set('Authorization', `Bearer ${GOOD}`).send(transcriptBody);
    expect(res.status).toBe(200);
    expect(res.body.clinicians).toEqual(['Dr. Lane']);
  });

  it('keeps the health check public', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('DELETE /api/account deletes the signed-in user (204) and only that user', async () => {
    deleteUser.mockClear();
    const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${GOOD}`);
    expect(res.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith('user-123');
  });

  it('DELETE /api/account refuses without a valid token (401) and deletes nothing', async () => {
    deleteUser.mockClear();
    expect((await request(app).delete('/api/account')).status).toBe(401);
    expect((await request(app).delete('/api/account').set('Authorization', 'Bearer nope')).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('DELETE /api/account reports a failed delete (500)', async () => {
    const failing = createApp({ auth: { ...configured, admin: { deleteUser: async () => false } } });
    expect((await request(failing).delete('/api/account').set('Authorization', `Bearer ${GOOD}`)).status).toBe(500);
  });
});

describe('sign-in not configured', () => {
  it('stays open for local dev and the demo (no token needed)', async () => {
    const app = createApp({ auth: { required: false } });
    expect((await request(app).post('/api/visit-summary').send(transcriptBody)).status).toBe(200);
  });

  it('fails closed with REQUIRE_AUTH=true and no Supabase settings (503)', async () => {
    const app = createApp({ auth: authConfigFromEnv({ REQUIRE_AUTH: 'true' }) });
    const res = await request(app).post('/api/visit-summary').send(transcriptBody);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AUTH_NOT_CONFIGURED');
  });

  it('never allows account deletion without sign-in configured (503)', async () => {
    const app = createApp({ auth: { required: false } });
    expect((await request(app).delete('/api/account')).status).toBe(503);
  });

  it('reads the environment: no Supabase vars → open; URL + anon key → required', () => {
    expect(authConfigFromEnv({}).required).toBe(false);
    const cfg = authConfigFromEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' });
    expect(cfg.required).toBe(true);
    expect(cfg.verifyToken).toBeTypeOf('function');
    expect(cfg.admin).toBeUndefined(); // no service key → no account deletion
  });
});

describe('browser client sends the token', () => {
  const app = createApp({ auth: configured });
  const serverFetch: typeof fetch = async (url, init) => {
    const r = await request(app).post(String(url)).set((init?.headers ?? {}) as Record<string, string>).send(String(init?.body ?? ''));
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('attaches the signed-in user’s token, and maps 401 to a log-in-again message', async () => {
    setAccessTokenProvider(async () => GOOD);
    expect((await requestVisitSummary(THEO_SAMPLE_TRANSCRIPT, 'sample', { patientName: 'Theo', fetchImpl: serverFetch })).status).toBe('ok');

    setAccessTokenProvider(async () => null);
    expect(await requestVisitSummary(THEO_SAMPLE_TRANSCRIPT, 'sample', { fetchImpl: serverFetch })).toEqual({
      status: 'rejected',
      error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE },
    });
  });
});
