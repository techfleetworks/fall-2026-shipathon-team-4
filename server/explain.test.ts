import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requestExplanation } from '../src/lib/api.js';
import { MAX_EXPLAIN_CHARS } from '../src/lib/explain/explain.js';
import { BLOCKED_FALLBACK } from '../src/lib/guardrails/copy.js';
import { CRISIS_HELP, createApp } from './app.js';

const app = createApp();
const post = (body: unknown) => request(app).post('/api/explain').send(body as object);

describe('POST /api/explain', () => {
  it('returns plain explanations for the terms in the text, with the disclaimer', async () => {
    const res = await post({ text: 'Reports daytime somnolence; ?orthostatic hypotension. RV in 4/52.' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.explanations.map((e: { found: string }) => e.found)).toEqual(['somnolence', '?', 'orthostatic hypotension', 'RV', '4/52']);
    expect(res.body.explanations[0]).toEqual({
      id: 'somnolence',
      term: 'Somnolence',
      kind: 'term',
      found: 'somnolence',
      plain: 'Strong sleepiness or drowsiness, especially during the day.',
    });
    expect(res.body.disclaimer).toBe('Not a diagnosis or medical advice — a tool to help you be heard.');
  });

  it('returns an empty list when nothing needs explaining', async () => {
    const res = await post({ text: 'I feel tired.' });
    expect(res.body).toMatchObject({ status: 'ok', explanations: [] });
  });

  it('routes crisis language to the crisis response, with no explanations and no echo', async () => {
    const res = await post({ text: 'somnolence. I want to hurt myself' });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
    expect(JSON.stringify(res.body)).not.toContain('hurt myself');
  });

  it.each([
    ['no text', {}, 'INVALID_TEXT'],
    ['text that is not a string', { text: 42 }, 'INVALID_TEXT'],
    ['an array body', ['somnolence'], 'INVALID_TEXT'],
    ['blank text', { text: '   ' }, 'EMPTY_TEXT'],
    ['text over the limit', { text: 'a'.repeat(MAX_EXPLAIN_CHARS + 1) }, 'TEXT_TOO_LONG'],
  ])('rejects %s (400)', async (_name, body, code) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toContain('aaaa');
  });

  it('refuses non-JSON (415) and the wrong method (405)', async () => {
    expect((await request(app).post('/api/explain').set('Content-Type', 'text/plain').send('somnolence')).status).toBe(415);
    expect((await request(app).get('/api/explain')).status).toBe(405);
  });

  it('never logs the text', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    await post({ text: 'PATIENT-SECRET somnolence' });
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('PATIENT-SECRET');
    spies.forEach((s) => s.mockRestore());
  });

  it('requires sign-in when sign-in is required', async () => {
    const locked = createApp({ auth: { required: true } });
    const res = await request(locked).post('/api/explain').send({ text: 'somnolence' });
    expect([401, 503]).toContain(res.status);
  });
});

describe('requestExplanation (browser client + real Express app)', () => {
  const serverFetch: typeof fetch = async (url, init) => {
    const r = await request(app)
      .post(String(url))
      .set((init?.headers ?? {}) as Record<string, string>)
      .send(String(init?.body ?? ''));
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('gets the explanations', async () => {
    const out = await requestExplanation('RV in 4/52', { fetchImpl: serverFetch });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.explanations.map((e) => e.id)).toEqual(['review', 'weeks']);
  });

  it('reports crisis', async () => {
    expect(await requestExplanation("I don't want to be here anymore", { fetchImpl: serverFetch })).toEqual({ status: 'crisis' });
  });

  it('passes on the server’s reason for a rejection', async () => {
    const out = await requestExplanation('  ', { fetchImpl: serverFetch });
    expect(out).toMatchObject({ status: 'rejected', error: { code: 'EMPTY_TEXT' } });
  });

  it('passes on a blocked result as the honest fallback', async () => {
    const blocked: typeof fetch = async () => new Response(JSON.stringify({ status: 'blocked', message: BLOCKED_FALLBACK, rules: ['no-diagnosis'] }), { status: 200 });
    expect(await requestExplanation('x', { fetchImpl: blocked })).toEqual({ status: 'blocked', message: BLOCKED_FALLBACK });
  });

  it.each([
    ['the network fails', async () => { throw new TypeError('offline'); }],
    ['the server sends a bad shape', async () => new Response(JSON.stringify({ status: 'ok', explanations: [{ id: 1 }] }), { status: 200 })],
    ['the server sends HTML', async () => new Response('<html>', { status: 502 })],
  ])('says the server is unavailable when %s', async (_name, impl) => {
    expect((await requestExplanation('somnolence', { fetchImpl: impl as typeof fetch })).status).toBe('unavailable');
  });
});
