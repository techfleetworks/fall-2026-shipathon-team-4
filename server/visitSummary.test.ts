import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { THEO_SAMPLE_TRANSCRIPT } from '../src/data/sampleTranscript.js';
import { requestVisitSummary } from '../src/lib/api.js';
import { normalizeTranscript, parseTurns } from '../src/lib/transcript/intake.js';
import { clinicianSpeakers, doctorSaidFrom, MAX_RECAP_LINES } from '../src/lib/transcript/recap.js';
import { CRISIS_HELP, createApp } from './app.js';

const app = createApp();
const post = (body: object) => request(app).post('/api/visit-summary').send(body);
const theo = parseTurns(normalizeTranscript(THEO_SAMPLE_TRANSCRIPT));

describe('recap helpers', () => {
  it('finds the clinician by the patient’s name, or by a clinical title', () => {
    expect(clinicianSpeakers(theo, 'Theo')).toEqual(['Dr. Lane']);
    expect(clinicianSpeakers(theo, 'Theo Marsh')).toEqual(['Dr. Lane']);
    expect(clinicianSpeakers(theo)).toEqual(['Dr. Lane']);
    expect(clinicianSpeakers({ speakers: ['Sam', 'Alex'] })).toEqual([]);
  });

  it('returns Dr. Lane’s three lines from Theo’s transcript, in order, in their words', () => {
    expect(doctorSaidFrom(theo, 'Theo')).toEqual([
      "That's probably the depression itself sapping your energy. Low energy is a core symptom.",
      "Your body usually adjusts to the medication in a few weeks. Let's give it time.",
      "It's possible, but I'd still put it down to the depression. Try to push through and we'll reassess next month.",
    ]);
  });

  it('de-duplicates and caps the lines', () => {
    const turns = Array.from({ length: 50 }, (_, i) => ({ speaker: 'Dr. A', text: `Line ${i % 40}` }));
    const out = doctorSaidFrom({ speakers: ['Dr. A', 'Pat'], turns }, 'Pat');
    expect(out).toHaveLength(MAX_RECAP_LINES);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe('POST /api/visit-summary', () => {
  it('returns the clinician’s lines for the Recap (200 ok)', async () => {
    const res = await post({ transcript: THEO_SAMPLE_TRANSCRIPT, source: 'sample', patientName: 'Theo' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', clinicians: ['Dr. Lane'], dialogueTurns: 7 });
    expect(res.body.doctorSaid).toHaveLength(3);
    expect(res.body.disclaimer).toBe('Synthetic — illustrative only, not medical advice.');
  });

  it('goes to the crisis path and builds nothing', async () => {
    const res = await post({ transcript: "Dr. Lane: How are things?\nTheo: I don't see the point anymore" });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
  });

  it.each([
    ['an empty transcript', { transcript: '  ' }, 'EMPTY'],
    ['a bad source', { transcript: 'Dr. A: hi', source: 'email' }, 'INVALID_INPUT'],
    ['a too-long patient name', { transcript: 'Dr. A: hi', patientName: 'x'.repeat(81) }, 'INVALID_INPUT'],
  ])('rejects %s (400)', async (_n, body, code) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it('client function talks to the real server', async () => {
    const serverFetch: typeof fetch = async (url, init) => {
      const r = await request(app).post(String(url)).set((init?.headers ?? {}) as Record<string, string>).send(String(init?.body ?? ''));
      return new Response(r.text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
    };
    const out = await requestVisitSummary(THEO_SAMPLE_TRANSCRIPT, 'sample', { patientName: 'Theo', fetchImpl: serverFetch });
    expect(out).toMatchObject({ status: 'ok', clinicians: ['Dr. Lane'] });
  });
});
