/**
 * "Play Theo's visit" (ADR-015): a public endpoint that only ever summarizes the server's own copy of
 * Theo's synthetic transcript. It must work without sign-in and must never take a visitor's text.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { playDemoVisit } from '../src/lib/demoApi.js';
import { planAfterVisitUpdate } from '../src/lib/afterVisit/useAfterVisitSummary.js';
import type { Visit } from '../src/lib/types.js';
import { createApp } from './app.js';

const THEO_POINTS = [
  'Daytime sleepiness since the dose increase — falling asleep at work',
  'Dizzy and lightheaded when standing up',
  'What are the options: lower the dose, switch, or change timing?',
];

// Sign-in required everywhere else: the demo endpoint must still answer.
const app = createApp({ auth: { required: true, verifyToken: async () => null } });
const play = (body: unknown) => request(app).post('/api/demo/play-visit').send(body as object);

describe('POST /api/demo/play-visit', () => {
  it('works without sign-in and summarizes Theo’s transcript, ticking the talking points that came up', async () => {
    const res = await play({ talkingPoints: THEO_POINTS });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Synthetic — illustrative only, not medical advice.');
    expect(res.body.summary.plan).toContain('Check again next month.');
    expect(res.body.summary.talkingPoints.map((p: { raised: boolean }) => p.raised)).toEqual([true, true, false]);
    // A question keeps its own question mark (no "timing?.").
    expect(res.body.summary.notCovered).toContain('This talking point did not come up: What are the options: lower the dose, switch, or change timing?');
  });

  it('never summarizes text a visitor sends: only Theo’s own transcript', async () => {
    const res = await play({ talkingPoints: [], transcript: 'Mallory: hi\nDr. Evil: You should stop taking your medication.', notes: 'injected' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/Mallory|Evil|injected|stop taking/);
    expect(res.body.summary.doctorSaid).toContain('The doctor thinks this is from the depression.');
  });

  it.each([
    ['talking points that are not a list', { talkingPoints: 'x' }],
    ['more than 3 talking points', { talkingPoints: ['a', 'b', 'c', 'd'] }],
    ['a talking point that is too long', { talkingPoints: ['x'.repeat(301)] }],
    ['a body that is not an object', ['x']],
  ])('rejects %s (400)', async (_n, body) => {
    expect((await play(body)).status).toBe(400);
  });

  it('refuses non-JSON (415) and the wrong method (405)', async () => {
    expect((await request(app).post('/api/demo/play-visit').set('Content-Type', 'text/plain').send('x')).status).toBe(415);
    expect((await request(app).get('/api/demo/play-visit')).status).toBe(405);
  });
});

describe('playDemoVisit (browser client) + saving it to the visit', () => {
  const serverFetch: typeof fetch = async (url, init) => {
    const r = await request(app).post(String(url)).set((init?.headers ?? {}) as Record<string, string>).send(String(init?.body ?? ''));
    return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  it('fills the visit like a recorded one: transcript recap, ticked points, next steps', async () => {
    const summary = await playDemoVisit(THEO_POINTS, { fetchImpl: serverFetch });
    expect(summary).toBeDefined();
    const visit: Visit = { id: 'next', date: '2026-12-02', clinician: 'Dr. Lane', priorities: THEO_POINTS, askingFor: [] };
    const u = planAfterVisitUpdate(visit, summary!, { visits: [visit], followUps: [] }, { source: 'transcript' });
    expect(u.visitPatch.recap?.source).toBe('transcript');
    expect(u.visitPatch.recap?.doctorSaid[0]).toBe('The doctor thinks this is from the depression.');
    expect(u.visitPatch.covered).toEqual(THEO_POINTS.slice(0, 2));
    expect(u.newFollowUps.map((f) => f.step)).toEqual([
      'Book a follow-up visit with Dr. Lane',
      'Ask about feeling dizzy when you stand up',
      'Ask: What are the options: lower the dose, switch, or change timing?',
    ]);
  });

  it('returns nothing (the screen shows a retry message) when the server can’t be reached', async () => {
    const offline: typeof fetch = async () => { throw new TypeError('offline'); };
    expect(await playDemoVisit([], { fetchImpl: offline })).toBeUndefined();
    const notFound: typeof fetch = async () => new Response('{}', { status: 404 });
    expect(await playDemoVisit([], { fetchImpl: notFound })).toBeUndefined();
  });
});
