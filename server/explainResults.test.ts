import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { THEO_CLINICAL_NOTE, THEO_LABS } from '../src/data/sampleResults.js';
import { requestResultsExplanation } from '../src/lib/api.js';
import { MAX_EXPLAIN_CHARS } from '../src/lib/explain/explain.js';
import { LABS_NOTE, MAX_LAB_FIELD_CHARS, MAX_LAB_ROWS } from '../src/lib/labs/labs.js';
import { CRISIS_HELP, createApp } from './app.js';

const app = createApp();
const post = (body: unknown) => request(app).post('/api/explain-results').send(body as object);

describe('POST /api/explain-results', () => {
  it('explains Theo’s labs and clinical note, with the ranges note and the disclaimer', async () => {
    const res = await post({ labs: THEO_LABS, note: THEO_CLINICAL_NOTE });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.labs.map((l: { position: string }) => l.position)).toEqual(['change', 'above', 'above', 'no-range', 'above']);
    expect(res.body.note.length).toBeGreaterThan(10);
    expect(res.body.labsNote).toBe(LABS_NOTE);
    expect(res.body.disclaimer).toBe('Not a diagnosis or medical advice — a tool to help you be heard.');
  });

  it('ignores fields it does not know (e.g. an interpretation sent along)', async () => {
    const res = await post({ labs: [{ ...THEO_LABS[1], plainMeaning: 'You have diabetes' }] });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('diabetes');
  });

  it('routes crisis words anywhere to the crisis response, with no echo', async () => {
    const res = await post({ labs: THEO_LABS, note: 'I want to hurt myself' });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
  });

  it.each([
    ['labs that is not a list', { labs: 'glucose 104' }, 'INVALID_RESULTS'],
    ['a row without a value', { labs: [{ test: 'Glucose' }] }, 'INVALID_RESULTS'],
    ['a blank test name', { labs: [{ test: ' ', value: '104' }] }, 'INVALID_RESULTS'],
    ['a range that is not text', { labs: [{ test: 'Glucose', value: '104', typicalRange: 70 }] }, 'INVALID_RESULTS'],
    ['a field over the limit', { labs: [{ test: 'G'.repeat(MAX_LAB_FIELD_CHARS + 1), value: '1' }] }, 'INVALID_RESULTS'],
    ['too many rows', { labs: Array.from({ length: MAX_LAB_ROWS + 1 }, () => ({ test: 'Glucose', value: '1' })) }, 'INVALID_RESULTS'],
    ['a note that is not text', { note: 5 }, 'INVALID_RESULTS'],
    ['a note over the limit', { note: 'a'.repeat(MAX_EXPLAIN_CHARS + 1) }, 'TEXT_TOO_LONG'],
    ['nothing at all', {}, 'EMPTY_RESULTS'],
    ['empty labs and a blank note', { labs: [], note: '  ' }, 'EMPTY_RESULTS'],
  ])('rejects %s (400)', async (_name, body, code) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it('refuses non-JSON (415) and the wrong method (405)', async () => {
    expect((await request(app).post('/api/explain-results').set('Content-Type', 'text/plain').send('x')).status).toBe(415);
    expect((await request(app).get('/api/explain-results')).status).toBe(405);
  });

  it('never logs the results', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    await post({ labs: [{ test: 'PATIENT-SECRET', value: '1' }], note: 'PATIENT-SECRET somnolence' });
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('PATIENT-SECRET');
    spies.forEach((s) => s.mockRestore());
  });
});

describe('requestResultsExplanation (browser client + real Express app)', () => {
  const serverFetch: typeof fetch = async (url, init) => {
    const r = await request(app)
      .post(String(url))
      .set((init?.headers ?? {}) as Record<string, string>)
      .send(String(init?.body ?? ''));
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('gets labs, note and the ranges note', async () => {
    const out = await requestResultsExplanation({ labs: [...THEO_LABS], note: 'RV in 4/52' }, { fetchImpl: serverFetch });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.labs).toHaveLength(5);
      expect(out.note.map((e) => e.id)).toEqual(['review', 'weeks']);
      expect(out.labsNote).toBe(LABS_NOTE);
    }
  });

  it('reports crisis and passes on rejections', async () => {
    expect(await requestResultsExplanation({ note: "I don't want to be here anymore" }, { fetchImpl: serverFetch })).toEqual({ status: 'crisis' });
    expect(await requestResultsExplanation({}, { fetchImpl: serverFetch })).toMatchObject({ status: 'rejected', error: { code: 'EMPTY_RESULTS' } });
  });

  it('says the server is unavailable on a bad answer or no network', async () => {
    const bad: typeof fetch = async () => new Response(JSON.stringify({ status: 'ok', labs: [{ test: 'x' }], note: [], labsNote: '' }), { status: 200 });
    const offline: typeof fetch = async () => { throw new TypeError('offline'); };
    expect((await requestResultsExplanation({ note: 'x' }, { fetchImpl: bad })).status).toBe('unavailable');
    expect((await requestResultsExplanation({ note: 'x' }, { fetchImpl: offline })).status).toBe('unavailable');
  });
});
