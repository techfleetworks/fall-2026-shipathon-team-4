import { describe, expect, it } from 'vitest';
import type { FollowUp, Visit } from '../types';
import { summarizeNotes, type AfterVisitSummary } from './summary';
import { needsSummary, notesKey, planAfterVisitUpdate } from './useAfterVisitSummary';

const TODAY = '2026-11-13';
const visit = (patch: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  date: '2026-11-10',
  clinician: 'Dr. Kim',
  priorities: ['Dizzy when I stand up', 'Weight gain'],
  askingFor: [],
  notes: 'Dr said it might be orthostatic hypotension\nfollow up in 4 weeks',
  ...patch,
});
const summaryFor = (v: Visit): AfterVisitSummary => {
  const r = summarizeNotes(v.notes ?? '', { talkingPoints: v.priorities });
  if (r.status !== 'ok') throw new Error(r.status);
  return r.summary;
};

describe('needsSummary: when a real user’s visit gets summarized', () => {
  it('a past visit with notes and no summary yet', () => {
    expect(needsSummary(visit(), TODAY)).toBe(true);
  });

  it.each([
    ['a future visit', visit({ date: '2026-12-01' })],
    ['no notes', visit({ notes: '' })],
    ['a transcript recap (Theo’s demo visit)', visit({ recap: { doctorSaid: ['x'], source: 'transcript', updatedAt: '' } })],
    ['no visit', undefined],
  ])('not for %s', (_n, v) => {
    expect(needsSummary(v, TODAY)).toBe(false);
  });

  it('not again for the same notes, but again when the notes change', () => {
    const v = visit();
    const done = { ...v, afterVisit: { ...summaryFor(v), basedOn: notesKey(v.notes!, v.priorities) } };
    expect(needsSummary(done, TODAY)).toBe(false);
    expect(needsSummary({ ...done, notes: `${done.notes}\nask about labs` }, TODAY)).toBe(true);
  });
});

describe('notes that say what the doctor will do', () => {
  it('turn "She will order a blood test" into a task for the doctor', () => {
    const v = visit({ notes: 'Dr said it might be orthostatic hypotension. She will order a blood test. follow up in 4 weeks' });
    const u = planAfterVisitUpdate(v, summaryFor(v), { visits: [v], followUps: [] });
    expect(u.newFollowUps.map((f) => [f.step, f.owner])).toContainEqual(['Blood test', 'Dr. Kim']);
  });

  it.each([['Dr. Kim is going to refer me to a therapist', 'Referral to a therapist'], ['They will call me with results', 'Call with results'], ['She will schedule an MRI', 'MRI']])('%s', (note, task) => {
    const r = summarizeNotes(note);
    expect(r.status === 'ok' && r.summary.promised).toEqual([task]);
  });
});

describe('planAfterVisitUpdate: what gets saved', () => {
  it('saves the summary, a plain recap, ticks covered talking points, and adds the action items', () => {
    const v = visit();
    const u = planAfterVisitUpdate(v, summaryFor(v), { visits: [v], followUps: [], now: '2026-11-13T00:00:00.000Z' });
    expect(u.visitPatch.recap).toEqual({ doctorSaid: ['Dr said it might be feeling dizzy when you stand up'], source: 'notes', updatedAt: '2026-11-13T00:00:00.000Z' });
    expect(u.visitPatch.covered).toEqual(['Dizzy when I stand up']);
    expect(u.visitPatch.afterVisit?.basedOn).toBe(notesKey(v.notes!, v.priorities));
    expect(u.newFollowUps.map((f) => [f.step, f.owner, f.dueDate])).toEqual([
      ['Book a follow-up visit with Dr. Kim', 'You', '2026-12-08'],
      ['Ask about Weight gain', 'You', '2026-12-08'],
    ]);
    expect(u.newFollowUps.every((f) => f.visitId === 'v1' && f.reminder)).toBe(true);
  });

  it('never overwrites a recap the patient already has (e.g. one they fixed)', () => {
    const v = visit({ recap: { doctorSaid: ['My own words'], source: 'notes', updatedAt: 'x' } });
    expect(planAfterVisitUpdate(v, summaryFor(v), { visits: [v], followUps: [] }).visitPatch).not.toHaveProperty('recap');
  });

  it('never unticks a talking point the patient ticked', () => {
    const v = visit({ covered: ['Weight gain'] });
    expect(planAfterVisitUpdate(v, summaryFor(v), { visits: [v], followUps: [] }).visitPatch.covered).toEqual(['Weight gain', 'Dizzy when I stand up']);
  });

  it('does not repeat next steps that are already saved', () => {
    const v = visit();
    const saved: FollowUp[] = [{ id: 'f', visitId: 'v1', step: 'Book a follow-up visit with Dr. Kim', dueDate: '2026-12-08', isVisit: true }];
    expect(planAfterVisitUpdate(v, summaryFor(v), { visits: [v], followUps: saved }).newFollowUps.map((f) => f.step)).toEqual(['Ask about Weight gain']);
  });

  it('skips "book a follow-up" when one is already on the calendar', () => {
    const v = visit();
    const booked: Visit = { id: 'v2', date: '2026-12-05', clinician: 'Dr. Kim', priorities: [], askingFor: [] };
    const steps = planAfterVisitUpdate(v, summaryFor(v), { visits: [v, booked], followUps: [] }).newFollowUps;
    expect(steps.map((f) => [f.step, f.dueDate])).toEqual([['Ask about Weight gain', '2026-12-05']]);
  });
});
