import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { THEO_SAMPLE_TRANSCRIPT } from '../data/sampleTranscript';
import { SERVER_UNAVAILABLE_MESSAGE, submitTranscriptToServer } from './api';

// A fetch that sends the request to the real Express app in-process, so these tests exercise
// the browser client and the server together, end to end, without a network.
const app = createApp();
const serverFetch: typeof fetch = async (url, init) => {
  const r = await request(app)
    .post(String(url))
    .set((init?.headers ?? {}) as Record<string, string>)
    .send(String(init?.body ?? ''));
  return new Response(r.text, { status: r.status, headers: { 'Content-Type': r.headers['content-type'] ?? 'application/json' } });
};

describe('submitTranscriptToServer (client + real Express app)', () => {
  it('sends the transcript to the server and gets back the payload', async () => {
    const out = await submitTranscriptToServer(THEO_SAMPLE_TRANSCRIPT, 'sample', { fetchImpl: serverFetch });
    expect(out.status).toBe('accepted');
    if (out.status === 'accepted') {
      expect(out.payload.speakers).toEqual(['Theo', 'Dr. Lane']);
      expect(out.payload.source).toBe('sample');
    }
  });

  it('calls POST /api/transcripts with JSON', async () => {
    const spy = vi.fn(serverFetch);
    await submitTranscriptToServer('Theo: hi\nDr. Lane: hi\nTheo: bye', 'paste', { fetchImpl: spy });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/transcripts');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ transcript: 'Theo: hi\nDr. Lane: hi\nTheo: bye', source: 'paste' });
  });

  it('passes on the server’s rejection message', async () => {
    const out = await submitTranscriptToServer('   ', 'paste', { fetchImpl: serverFetch });
    expect(out).toMatchObject({ status: 'rejected', error: { code: 'EMPTY' } });
  });

  it('reports crisis from the server (no payload)', async () => {
    const out = await submitTranscriptToServer("Theo: I don't see the point anymore", 'paste', { fetchImpl: serverFetch });
    expect(out).toEqual({ status: 'crisis' });
  });

  it('turns a 413 (body over 1 MB) into the "too long" message', async () => {
    const out = await submitTranscriptToServer('a'.repeat(1_100_000), 'paste', { fetchImpl: serverFetch });
    expect(out).toMatchObject({ status: 'rejected', error: { code: 'TOO_LONG' } });
  });

  it('says the server is unavailable when the network fails, instead of processing locally', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await submitTranscriptToServer('Theo: hi', 'paste', { fetchImpl: offline })).toEqual({
      status: 'unavailable',
      message: SERVER_UNAVAILABLE_MESSAGE,
    });
  });

  it('treats an unexpected answer (e.g. the app page instead of the API) as unavailable', async () => {
    const wrong: typeof fetch = async () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    expect((await submitTranscriptToServer('Theo: hi', 'paste', { fetchImpl: wrong })).status).toBe('unavailable');
  });
});
