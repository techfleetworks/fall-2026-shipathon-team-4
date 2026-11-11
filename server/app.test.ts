import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEO_SAMPLE_TRANSCRIPT } from '../src/data/sampleTranscript.js';
import { SYNTHETIC_LABEL } from '../src/lib/transcript/constants.js';
import { CRISIS_HELP, createApp } from './app.js';

// supertest sends real HTTP requests to the Express app, without opening a network port.
const app = createApp();

afterEach(() => vi.restoreAllMocks());

describe('GET /api/health', () => {
  it('returns ok as JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'get-heard-api' });
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false);
  });

  it('sends the security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('POST /api/transcripts', () => {
  it('accepts Theo’s sample transcript (201) and returns the payload with the synthetic label', async () => {
    const res = await request(app).post('/api/transcripts').send({ transcript: THEO_SAMPLE_TRANSCRIPT, source: 'sample' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');
    expect(res.body.payload).toMatchObject({
      schemaVersion: 1,
      source: 'sample',
      speakers: ['Theo', 'Dr. Lane'],
      stats: { dialogueTurns: 7 },
      disclaimer: SYNTHETIC_LABEL,
    });
  });

  it('defaults the source to "paste"', async () => {
    const res = await request(app).post('/api/transcripts').send({ transcript: 'Theo: hi\nDr. Lane: hello\nTheo: bye' });
    expect(res.status).toBe(201);
    expect(res.body.payload.source).toBe('paste');
  });

  it('rejects an empty transcript (400 EMPTY)', async () => {
    const res = await request(app).post('/api/transcripts').send({ transcript: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: 'error', error: { code: 'EMPTY' } });
  });

  it('routes the Starter Pack safety fixture to help, with no payload (200 crisis)', async () => {
    const res = await request(app)
      .post('/api/transcripts')
      .send({ transcript: "Dr. Lane: How have things been?\nTheo: I don't see the point anymore" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
    expect(JSON.stringify(res.body)).not.toContain('see the point');
    // Team rule: surface 988 directly (first), then warmline, then 911. Gentle, no police/rescue framing.
    expect(res.body.help.resources.map((r: { id: string }) => r.id)).toEqual(['988', 'warmline', '911']);
    expect(res.body.help.message).toContain('988');
    expect(JSON.stringify(res.body)).not.toMatch(/police|rescue|send (?:someone|anyone)/i);
  });

  it.each([
    ['a missing transcript', {}],
    ['a number', { transcript: 42 }],
    ['an unknown source', { transcript: 'Theo: hi', source: 'email' }],
  ])('rejects %s (400)', async (_name, body) => {
    const res = await request(app).post('/api/transcripts').send(body);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('rejects a JSON array body (400 INVALID_INPUT)', async () => {
    const res = await request(app).post('/api/transcripts').send([{ transcript: 'x' }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects a non-JSON body (415)', async () => {
    const res = await request(app).post('/api/transcripts').set('Content-Type', 'text/plain').send('Theo: hi');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects malformed JSON (400) without echoing it', async () => {
    const res = await request(app).post('/api/transcripts').set('Content-Type', 'application/json').send('{"transcript": "SECRET');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  it('rejects a body over 1 MB (413) before reading the transcript', async () => {
    const res = await request(app).post('/api/transcripts').send({ transcript: 'a'.repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never echoes transcript content in an error', async () => {
    const res = await request(app).post('/api/transcripts').send({ transcript: 'PATIENT-SECRET '.repeat(20_000) });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('PATIENT-SECRET');
  });
});

describe('routing and errors', () => {
  it('returns 405 for the wrong method on a known endpoint', async () => {
    const res = await request(app).get('/api/transcripts');
    expect(res.status).toBe(405);
    expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('returns a JSON 404 for an unknown API address', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('logs nothing about the request body on success or rejection', async () => {
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    await request(app).post('/api/transcripts').send({ transcript: 'Theo: PATIENT-SECRET\nDr. Lane: ok\nTheo: ok' });
    await request(app).post('/api/transcripts').send({ transcript: '' });
    expect(JSON.stringify([...log.mock.calls, ...err.mock.calls])).not.toContain('PATIENT-SECRET');
  });
});
