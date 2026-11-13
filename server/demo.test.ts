import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildDemoState } from '../src/data/demo.js';
import { SYNTHETIC_LABEL } from '../src/lib/transcript/constants.js';
import { hasCrisisLanguage } from '../src/lib/safety.js';
import { createApp } from './app.js';
import { daysBetween, safeDemoData, shiftDates } from './demo/publicDemo.js';
import { memoryDemoSource, type DemoSource } from './demo/source.js';
import { buildTheoRecord, THEO_DEMO_EMAIL } from './demo/theoRecord.js';

describe('shiftDates: keeps the demo current', () => {
  it('moves dates and timestamps forward, across month ends', () => {
    expect(shiftDates('2026-11-25', 12)).toBe('2026-12-07');
    expect(shiftDates('2026-11-04T17:00:00.000Z', 12)).toBe('2026-11-16T17:00:00.000Z');
    expect(shiftDates({ a: ['2026-12-31'], b: { c: '2026-02-27' } }, 2)).toEqual({ a: ['2027-01-02'], b: { c: '2026-03-01' } });
  });

  it.each([['5/52'], ['2/5'], ['7/10'], ['Ziprasidone'], ['2026'], ['118/76 -> 98/64 mmHg']])('leaves %j alone', (v) => {
    expect(shiftDates(v, 30)).toBe(v);
  });

  it('counts days without a time-zone slip', () => {
    expect(daysBetween('2026-11-01', '2026-11-13')).toBe(12);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2); // across a daylight-saving change
    expect(daysBetween('2026-11-13', '2026-11-13')).toBe(0);
  });
});

describe('safeDemoData: only safe fields leave the server', () => {
  const raw = {
    profile: { name: 'Theo', lastName: 'Marsh', age: 30, email: 'theo@x.example', passwordHash: { salt: 's', hash: 'h' }, consent: { saveStory: true } },
    visits: [{ id: 'v1' }],
    evidence: [],
    shareLinks: [{ token: 'secret' }],
    notifications: { prepReminders: true },
    signedIn: true,
    demoMode: false,
  };

  it('drops emails, password hashes, share links and settings; marks it as demo', () => {
    const out = safeDemoData(raw)!;
    expect(out.profile).toEqual({ name: 'Theo', lastName: 'Marsh', age: 30, onboarded: true, consentAccepted: true });
    expect(out).not.toHaveProperty('shareLinks');
    expect(out).not.toHaveProperty('notifications');
    expect(out).not.toHaveProperty('signedIn');
    expect(out.demoMode).toBe(true);
    expect(out.visits).toEqual([{ id: 'v1' }]);
    expect(out.medications).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/secret|theo@x|passwordHash/);
  });

  it.each([['no profile', { visits: [] }], ['a profile without a name', { profile: { age: 3 } }], ['not an object', 'Theo']])('rejects %s', (_n, v) => {
    expect(safeDemoData(v)).toBeUndefined();
  });
});

describe('buildTheoRecord: built from the team’s existing content', () => {
  const theo = buildTheoRecord();
  const visits = theo.visits as { date: string; clinician?: string; priorities: string[]; recap?: { doctorSaid: string[]; source: string } }[];
  const past = visits.filter((v) => v.recap);

  it('keeps Diana’s demo data as-is (profile, medication wording, visits, timeline)', () => {
    const diana = buildDemoState();
    expect((theo.profile as { name: string }).name).toBe('Theo');
    expect((theo.medications as { name: string; dose: string }[]).map((m) => [m.name, m.dose])).toEqual(diana.medications!.map((m) => [m.name, m.dose]));
    expect(visits.map((v) => [v.clinician, v.priorities])).toEqual(diana.visits!.map((v) => [v.clinician, v.priorities]));
    expect((theo.evidence as { detail: string }[]).map((e) => e.detail)).toEqual(diana.evidence!.map((e) => e.detail));
    expect(theo.demoMode).toBe(true);
  });

  it('gives the past visit (only) a plain-language summary of transcript.txt', () => {
    expect(past).toHaveLength(1);
    const v = past[0] as typeof past[0] & { covered?: string[]; afterVisit?: { plan: string[]; notCovered: string[]; meetsReadingTarget: boolean } };
    expect(v.recap!.source).toBe('transcript');
    // The Recap's "What the doctor said" is now in plain words, not Dr. Lane's exact sentences.
    expect(v.recap!.doctorSaid).toContain('The doctor thinks this is from the depression.');
    expect(v.recap!.doctorSaid.join(' ')).not.toMatch(/sapping|reassess|core symptom/);
    expect(v.afterVisit!.plan).toContain('Check again next month.');
    expect(v.afterVisit!.notCovered).toContain('The doctor did not talk about feeling dizzy when you stand up.');
    expect(v.afterVisit!.meetsReadingTarget).toBe(true);
    // His talking point came up, so Diana's Recap no longer says "(not covered)".
    expect(v.covered).toEqual(['Daytime sleepiness since the dose change']);
  });

  it('adds his last name from personas.json, and nothing from the crisis fixture', () => {
    expect((theo.profile as { lastName: string }).lastName).toBe('Marsh');
    expect(hasCrisisLanguage(JSON.stringify(theo))).toBe(false);
    expect(THEO_DEMO_EMAIL).toMatch(/@example\.com$/);
  });

  it('survives the public filter intact', () => {
    const safe = safeDemoData(theo)!;
    expect(safe.visits).toEqual(theo.visits);
    expect(safe.evidence).toEqual(theo.evidence);
  });
});

describe('GET /api/demo', () => {
  const record = { data: buildTheoRecord(), anchorDate: '2026-11-01' };
  const app = (source: DemoSource | undefined, today = '2026-11-13') => createApp({ demo: source, today: () => today });

  it('returns Theo with dates moved to today, safe fields only, labelled synthetic', async () => {
    const res = await request(app(memoryDemoSource(record))).get('/api/demo');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe(SYNTHETIC_LABEL);
    expect(res.body.data.profile.name).toBe('Theo');
    const before = (record.data.visits as { date: string }[]).map((v) => v.date);
    const after = (res.body.data.visits as { date: string }[]).map((v) => v.date);
    expect(after).toEqual(before.map((d) => shiftDates(d, 12)));
  });

  it('needs no sign-in, even when sign-in is required elsewhere', async () => {
    const locked = createApp({ demo: memoryDemoSource(record), auth: { required: true } });
    expect((await request(locked).get('/api/demo')).status).toBe(200);
  });

  it('says not set up (404) when there is no demo record or it is unusable', async () => {
    expect((await request(app(undefined)).get('/api/demo')).body.error.code).toBe('DEMO_NOT_SET_UP');
    expect((await request(app(memoryDemoSource(null))).get('/api/demo')).status).toBe(404);
    expect((await request(app(memoryDemoSource({ data: { visits: [] }, anchorDate: '2026-11-01' }))).get('/api/demo')).status).toBe(404);
  });

  it('a database error is a 500, never "not set up"', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: DemoSource = { get: async () => { throw new Error('db down'); }, getForUser: async () => null };
    expect((await request(app(broken)).get('/api/demo')).status).toBe(500);
    err.mockRestore();
  });

  it('is read-only (405 for writes)', async () => {
    expect((await request(app(memoryDemoSource(record))).post('/api/demo').send({})).status).toBe(405);
  });
});
