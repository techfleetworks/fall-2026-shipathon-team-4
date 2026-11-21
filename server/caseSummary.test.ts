import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CRISIS_HELP, createApp } from './app.js';
import { MAX_CASE_ITEMS } from './caseInputs.js';

const app = createApp({ today: () => '2026-11-15' });
const post = (body: unknown) => request(app).post('/api/case-summary').send(body as object);

const RECORD = {
  evidence: [
    { id: 'm', date: '2026-10-01', type: 'medication', title: 'Medication', detail: 'Dose increased' },
    { id: 's', date: '2026-10-03', type: 'symptom', title: 'Symptom', detail: 'Dizzy when standing' },
  ],
  visits: [{ id: 'v', date: '2026-11-01', clinician: 'Dr. Lane', priorities: ['Dizzy when standing'], checkIn: { feltHeard: 2 }, afterVisit: { talkingPoints: [{ text: 'Dizzy when standing', raised: false }] } }],
  followUps: [{ id: 'f', step: 'Blood test', dueDate: '2026-11-08' }],
  summaries: [{ id: 'x', createdAt: '2026-11-02T10:00:00Z', opening: 'I get dizzy when I stand up', fields: [{ key: 'onset', label: 'Onset', clinical: '2–4 weeks, began after a medication change' }] }],
};

describe('POST /api/case-summary', () => {
  it('returns patterns, open questions and key dates from the record sent', async () => {
    const res = await post(RECORD);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.caseView.enough).toBe(true);
    expect(res.body.caseView.patterns.map((p: { kind: string }) => p.kind)).toEqual(['timing']);
    expect(res.body.caseView.openQuestions.map((q: { id: string }) => q.id)).toEqual(['overdue-f', 'not-covered-v-1']);
    expect(res.body.caseView.highlights).toHaveLength(3);
    expect(typeof res.body.disclaimer).toBe('string');
  });

  it('builds the case in doctor terms (translation engine over the record and the latest story)', async () => {
    const { caseView } = (await post(RECORD)).body;
    expect(caseView.clinical.presenting).toEqual(['Orthostatic symptoms — dizziness on standing (possible low blood pressure on standing)']);
    expect(caseView.clinical.course).toEqual(['Onset: 2–4 weeks, began after a medication change']);
    expect(caseView.patterns[0].clinical).toBe('Symptom onset Oct 3: Orthostatic symptoms — dizziness on standing (possible low blood pressure on standing). Onset 2 days after medication change: Dose increased (Oct 1). Temporal association only.');
    expect(caseView.openQuestions[0].clinical).toBe('Outstanding follow-up: Blood test; due Nov 8, no outcome recorded.');
  });

  it('accepts a check-in where "Did you feel heard?" was skipped', async () => {
    const res = await post({ ...RECORD, visits: [{ ...RECORD.visits[0], checkIn: {} }] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('an empty record is a normal answer that says there is not enough yet (not an error)', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body.caseView).toMatchObject({ enough: false, entries: 0, patterns: [] });
  });

  it('crisis language in the record → crisis help, nothing built', async () => {
    const res = await post({ evidence: [{ id: 'a', date: '2026-10-01', type: 'note', title: 'Note', detail: 'I want to end my life' }] });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
  });

  it.each([
    ['a list that is not a list', { evidence: 'x' }],
    ['a bad date', { evidence: [{ id: 'a', date: '11/01/2026', type: 'note', title: 'Note', detail: '' }] }],
    ['an unknown entry type', { evidence: [{ id: 'a', date: '2026-11-01', type: 'diagnosis', title: 'x', detail: '' }] }],
    ['felt heard out of range', { visits: [{ id: 'v', date: '2026-11-01', priorities: [], checkIn: { feltHeard: 9 } }] }],
    ['an unknown outcome', { followUps: [{ id: 'f', step: 'x', dueDate: '2026-11-01', outcome: 'maybe' }] }],
    ['too many entries', { evidence: Array.from({ length: MAX_CASE_ITEMS + 1 }, (_, i) => ({ id: `${i}`, date: '2026-11-01', type: 'note', title: 'n', detail: '' })) }],
    ['text over the limit', { evidence: [{ id: 'a', date: '2026-11-01', type: 'note', title: 'n', detail: 'a'.repeat(2001) }] }],
    ['a story field with an unknown key', { summaries: [{ createdAt: '2026-11-01T00:00:00Z', fields: [{ key: 'diagnosis', label: 'x', clinical: 'x' }] }] }],
    ['a story with a bad date', { summaries: [{ createdAt: 'yesterday', fields: [] }] }],
    ['an array body', []],
  ])('rejects %s (400 INVALID_CASE)', async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CASE');
    expect(JSON.stringify(res.body)).not.toContain('diagnosis'); // never echoes input
  });

  it('rejects a body that is not JSON (415) and other methods (405)', async () => {
    expect((await request(app).post('/api/case-summary').set('Content-Type', 'text/plain').send('hi')).status).toBe(415);
    expect((await request(app).get('/api/case-summary')).status).toBe(405);
  });
});
