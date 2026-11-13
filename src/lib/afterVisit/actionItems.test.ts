import { describe, expect, it } from 'vitest';
import { buildTheoRecord } from '../../../server/demo/theoRecord';
import { THEO_SAMPLE_TRANSCRIPT } from '../../data/sampleTranscript';
import { todayISO } from '../dates';
import { processTranscript } from '../transcript/intake';
import type { FollowUp, Visit } from '../types';
import { extractActionItems, followUpDays } from './actionItems';
import { summarizeVisit, type AfterVisitSummary } from './summary';

const summaryOf = (text: string, patientName: string): AfterVisitSummary => {
  const p = processTranscript(text, 'paste');
  if (p.status !== 'accepted') throw new Error(p.status);
  const s = summarizeVisit(p.payload, { patientName });
  if (s.status !== 'ok') throw new Error(s.status);
  return s.summary;
};

const SAM = 'Sam: Hi.\nDr. Kim: Hello there.\nSam: I feel off and I get dizzy when I stand.\nDr. Kim: Let us run a thyroid panel and an ECG today. We will follow up in two weeks.';

describe('followUpDays', () => {
  it.each([
    ['Check again next month.', 30],
    ['Check again next week.', 7],
    ['Check again in two weeks.', 14],
    ['Check again in 4 weeks.', 28],
    ['Check again in a few weeks.', 21],
    ['Check again in 3 months.', 90],
    ['Check again at your next visit.', undefined],
  ])('%s → %s days', (line, days) => {
    expect(followUpDays(line)).toBe(days);
  });
});

describe('extractActionItems', () => {
  it('a new visit: book the follow-up, what the doctor will do, and what to ask', () => {
    const items = extractActionItems(summaryOf(SAM, 'Sam'), { visitDate: '2026-11-13', clinician: 'Dr. Kim' });
    expect(items).toEqual([
      { step: 'Book a follow-up visit with Dr. Kim', owner: 'You', dueDate: '2026-11-27', isVisit: true, why: 'Plan from your visit on Nov 13: check again in two weeks.' },
      { step: 'Run a thyroid panel and an ECG', owner: 'Dr. Kim', dueDate: '2026-11-27', isVisit: false, why: 'The doctor said they would do this on Nov 13.' },
      { step: 'Ask about feeling dizzy when you stand up', owner: 'You', dueDate: '2026-11-27', isVisit: false, why: 'Not covered at your visit on Nov 13.' },
    ]);
  });

  it('does not ask to book a follow-up that is already on the calendar; asks go to that visit', () => {
    const booked: Pick<Visit, 'date' | 'clinician'>[] = [{ date: '2026-11-25', clinician: 'Dr. Kim' }];
    const items = extractActionItems(summaryOf(SAM, 'Sam'), { visitDate: '2026-11-13', clinician: 'Dr. Kim', upcomingVisits: booked });
    expect(items.some((i) => i.isVisit)).toBe(false);
    expect(items.find((i) => i.step.startsWith('Ask about'))!.dueDate).toBe('2026-11-25');
  });

  it('a visit with another clinician does not count as booked', () => {
    const items = extractActionItems(summaryOf(SAM, 'Sam'), { visitDate: '2026-11-13', clinician: 'Dr. Kim', upcomingVisits: [{ date: '2026-11-25', clinician: 'Dr. Lane' }] });
    expect(items.some((i) => i.isVisit)).toBe(true);
  });

  it('skips items already saved as follow-ups', () => {
    const existing: Pick<FollowUp, 'step' | 'dueDate' | 'isVisit'>[] = [{ step: 'Run a thyroid panel and an ECG', dueDate: '2026-11-20', isVisit: false }];
    expect(extractActionItems(summaryOf(SAM, 'Sam'), { visitDate: '2026-11-13', clinician: 'Dr. Kim', existing }).map((i) => i.step)).not.toContain('Run a thyroid panel and an ECG');
  });

  it('invents nothing when the visit set no plan and promised nothing', () => {
    const s = summaryOf('Sam: Hi.\nDr. Kim: Hello there.\nSam: Thanks.\nDr. Kim: Take care now.', 'Sam');
    expect(extractActionItems(s, { visitDate: '2026-11-13' })).toEqual([]);
  });

  it('reports Theo’s doctor’s plan without judging it (no "push through" turned into a task)', () => {
    const s = summaryOf(THEO_SAMPLE_TRANSCRIPT, 'Theo');
    const steps = extractActionItems(s, { visitDate: '2026-11-04', clinician: 'Dr. Lane' }).map((i) => i.step);
    expect(steps).toEqual(['Book a follow-up visit with Dr. Lane', 'Ask about feeling dizzy when you stand up']);
    expect(JSON.stringify(steps)).not.toMatch(/push through|ziprasidone|mg/i);
  });
});

describe('Theo’s record: action items join his follow-ups (Diana’s Next steps lists them)', () => {
  it('adds the dizziness question for his booked visit, and no duplicate follow-up visit', () => {
    const theo = buildTheoRecord() as { visits: Visit[]; followUps: FollowUp[] };
    const past = theo.visits.find((v) => v.date < todayISO())!;
    const next = theo.visits.find((v) => v.date >= todayISO())!;
    const mine = theo.followUps.filter((f) => f.visitId === past.id);
    expect(mine.map((f) => f.step)).toEqual(['Follow-up visit', 'Ask about feeling dizzy when you stand up']);
    expect(mine[1]).toMatchObject({ owner: 'You', dueDate: next.date, isVisit: false, reminder: true });
  });
});
