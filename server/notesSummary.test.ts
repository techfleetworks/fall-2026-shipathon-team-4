import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requestNotesSummary } from '../src/lib/api.js';
import { MAX_EXPLAIN_CHARS } from '../src/lib/explain/explain.js';
import { CRISIS_HELP, createApp } from './app.js';

const app = createApp();
const post = (body: unknown) => request(app).post('/api/notes-summary').send(body as object);

const TYPED = 'Dr said it might be orthostatic hypotension\nfollow up in 4 weeks';
const SPOKEN = 'Me: I get dizzy when I stand up.\nDr. Kim: Hello there.\nMe: It started after the dose change.\nDr. Kim: Let us run a blood test today. We will follow up in two weeks.';

describe('POST /api/notes-summary (real users: the visit’s quick notes)', () => {
  it('summarizes typed notes in plain words, with the plan', async () => {
    const res = await post({ notes: TYPED, talkingPoints: ['Dizzy when I stand up'] });
    expect(res.status).toBe(200);
    expect(res.body.summary.source).toBe('notes');
    expect(res.body.summary.doctorSaid).toEqual(['Your notes: Dr said it might be feeling dizzy when you stand up']);
    expect(res.body.summary.plan).toEqual(['Check again in 4 weeks.']);
    expect(res.body.summary.talkingPoints).toEqual([{ text: 'Dizzy when I stand up', raised: true }]);
  });

  it('summarizes notes that read like a conversation as a transcript', async () => {
    const res = await post({ notes: SPOKEN });
    expect(res.body.summary.source).toBe('transcript');
    expect(res.body.summary.youRaised).toContain('You talked about feeling dizzy when you stand up.');
    expect(res.body.summary.promised).toEqual(['Blood test']);
    expect(res.body.summary.plan).toEqual(['Check again in two weeks.']);
  });

  it('routes crisis language to crisis support, with no summary', async () => {
    const res = await post({ notes: 'follow up in 2 weeks. I want to hurt myself' });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
  });

  it.each([
    ['no notes', {}, 'INVALID_TEXT'],
    ['notes that are not text', { notes: 3 }, 'INVALID_TEXT'],
    ['blank notes', { notes: '  ' }, 'EMPTY_TEXT'],
    ['notes over the limit', { notes: 'a'.repeat(MAX_EXPLAIN_CHARS + 1) }, 'TEXT_TOO_LONG'],
    ['too many talking points', { notes: TYPED, talkingPoints: ['a', 'b', 'c', 'd'] }, 'INVALID_TEXT'],
  ])('rejects %s (400)', async (_n, body, code) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it('refuses non-JSON (415) and the wrong method (405)', async () => {
    expect((await request(app).post('/api/notes-summary').set('Content-Type', 'text/plain').send('x')).status).toBe(415);
    expect((await request(app).get('/api/notes-summary')).status).toBe(405);
  });

  it('never logs the notes', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    await post({ notes: 'PATIENT-SECRET follow up in 2 weeks' });
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('PATIENT-SECRET');
    spies.forEach((s) => s.mockRestore());
  });
});

describe('requestNotesSummary (browser client + real Express app)', () => {
  const serverFetch: typeof fetch = async (url, init) => {
    const r = await request(app).post(String(url)).set((init?.headers ?? {}) as Record<string, string>).send(String(init?.body ?? ''));
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('gets the summary', async () => {
    const out = await requestNotesSummary(TYPED, [], { fetchImpl: serverFetch });
    expect(out.status === 'ok' && out.summary.plan).toEqual(['Check again in 4 weeks.']);
  });

  it('reports crisis, rejections and the server being down', async () => {
    expect(await requestNotesSummary("I don't want to be here anymore", [], { fetchImpl: serverFetch })).toEqual({ status: 'crisis' });
    expect(await requestNotesSummary(' ', [], { fetchImpl: serverFetch })).toMatchObject({ status: 'rejected', error: { code: 'EMPTY_TEXT' } });
    const offline: typeof fetch = async () => { throw new TypeError('offline'); };
    expect((await requestNotesSummary(TYPED, [], { fetchImpl: offline })).status).toBe('unavailable');
  });
});
