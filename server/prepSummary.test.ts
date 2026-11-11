import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { THEO_PREP } from '../src/data/evalScenarios.js';
import { requestPrepSummary } from '../src/lib/api.js';
import { BLOCKED_FALLBACK } from '../src/lib/guardrails/copy.js';
import type { StoryDraft } from '../src/lib/types.js';
import { CRISIS_HELP, createApp } from './app.js';
import { MAX_ANSWER_CHARS, parseStoryDraft } from './storyDraft.js';

const app = createApp();

const theoDraft = (): StoryDraft => ({
  opening: `${THEO_PREP.goal} ${THEO_PREP.noticing}`,
  onset: { choice: '1–3 months', text: 'started 5 weeks ago', afterMedChange: true },
  frequency: { choice: 'Every day', text: '' },
  severity: { score: 7, impacts: ['Work or school'], text: '' },
  triggers: { choices: ['After a dose', 'Standing up'], text: '' },
  tried: { choices: ['Medication'], medName: 'Ziprasidone', medDose: '40 mg', medDuration: '5 weeks', outcome: 'more drowsy', text: '' },
});

const post = (body: unknown) => request(app).post('/api/prep-summary').send(body as object);

describe('POST /api/prep-summary', () => {
  it('turns Theo’s story into doctor terms on the server (200 ok, with the disclaimer)', async () => {
    const res = await post({ draft: theoDraft() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const byKey = Object.fromEntries(res.body.fields.map((f: { key: string; clinical: string }) => [f.key, f.clinical]));
    expect(byKey.symptoms).toContain('Over-sedation');
    expect(byKey.tried).toContain('Ziprasidone 40 mg');
    expect(res.body.disclaimer).toBe('Not a diagnosis or medical advice — a tool to help you be heard.');
  });

  it('routes crisis language to the crisis response, with no summary', async () => {
    const d = theoDraft();
    d.triggers.text = 'I want to hurt myself';
    const res = await post({ draft: d });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
    expect(JSON.stringify(res.body)).not.toContain('hurt myself');
  });

  it('rejects an empty story (400 EMPTY_STORY)', async () => {
    const res = await post({ draft: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_STORY');
  });

  it.each([
    ['no draft', {}],
    ['a draft that is a string', { draft: 'hello' }],
    ['a chip value the app never offers', { draft: { ...theoDraft(), frequency: { choice: 'Hourly', text: '' } } }],
    ['a severity outside 0–10', { draft: { ...theoDraft(), severity: { score: 99, impacts: [], text: '' } } }],
    ['an answer over the length limit', { draft: { ...theoDraft(), opening: 'a'.repeat(MAX_ANSWER_CHARS + 1) } }],
    ['a number where text belongs', { draft: { ...theoDraft(), opening: 42 } }],
  ])('rejects %s (400 INVALID_STORY)', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STORY');
  });

  it('ignores fields it does not know (no mass assignment)', () => {
    const parsed = parseStoryDraft({ ...theoDraft(), isAdmin: true, onset: { ...theoDraft().onset, secret: 'x' } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.draft).not.toHaveProperty('isAdmin');
      expect(parsed.draft.onset).not.toHaveProperty('secret');
    }
  });

  it('refuses non-JSON (415) and the wrong method (405)', async () => {
    expect((await request(app).post('/api/prep-summary').set('Content-Type', 'text/plain').send('hi')).status).toBe(415);
    expect((await request(app).get('/api/prep-summary')).status).toBe(405);
  });

  it('never logs the story', async () => {
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    const d = theoDraft();
    d.opening = 'PATIENT-SECRET drowsy';
    await post({ draft: d });
    expect(JSON.stringify([...log.mock.calls, ...err.mock.calls])).not.toContain('PATIENT-SECRET');
    log.mockRestore();
    err.mockRestore();
  });
});

describe('requestPrepSummary (browser client + real Express app)', () => {
  const serverFetch: typeof fetch = async (url, init) => {
    const r = await request(app)
      .post(String(url))
      .set((init?.headers ?? {}) as Record<string, string>)
      .send(String(init?.body ?? ''));
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('gets the fields from the server', async () => {
    const out = await requestPrepSummary(theoDraft(), { fetchImpl: serverFetch });
    expect(out.status).toBe('ok');
  });

  it('reports crisis from the server', async () => {
    const d = theoDraft();
    d.opening = "I don't want to be here anymore";
    expect(await requestPrepSummary(d, { fetchImpl: serverFetch })).toEqual({ status: 'crisis' });
  });

  it('passes on a blocked result as the honest fallback', async () => {
    const blocked: typeof fetch = async () =>
      new Response(JSON.stringify({ status: 'blocked', message: BLOCKED_FALLBACK, rules: ['no-diagnosis'] }), { status: 200 });
    expect(await requestPrepSummary(theoDraft(), { fetchImpl: blocked })).toEqual({ status: 'blocked', message: BLOCKED_FALLBACK });
  });

  it('says the server is unavailable instead of translating on the device', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect((await requestPrepSummary(theoDraft(), { fetchImpl: offline })).status).toBe('unavailable');
  });
});
