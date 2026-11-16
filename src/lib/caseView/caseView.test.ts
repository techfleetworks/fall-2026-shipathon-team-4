import { describe, expect, it } from 'vitest';
import { buildTheoRecord } from '../../../server/demo/theoRecord.js';
import { todayISO } from '../dates.js';
import { buildCaseView, CASE_NOTE, MAX_HIGHLIGHTS, sameConcern, type CaseInputs, type CaseView } from './caseView.js';

const TODAY = '2026-11-15';
const EMPTY: CaseInputs = { medications: [], evidence: [], visits: [], followUps: [] };
const view = (input: Partial<CaseInputs>, today = TODAY): CaseView => {
  const r = buildCaseView({ ...EMPTY, ...input }, today);
  if (r.status !== 'ok') throw new Error(r.status);
  return r.view;
};
const ev = (id: string, date: string, type: 'medication' | 'symptom' | 'visit' | 'note', detail: string, title: string = type) => ({ id, date, type, title, detail });

describe('case view: honest about thin records', () => {
  it('a brand-new user gets no patterns, no highlights, and a count of 0', () => {
    expect(view({})).toEqual({ enough: false, entries: 0, patterns: [], openQuestions: [], highlights: [], note: CASE_NOTE });
  });

  it('one dated entry is still not enough to compare', () => {
    const v = view({ evidence: [ev('a', '2026-11-01', 'symptom', 'Headaches')] });
    expect(v.enough).toBe(false);
    expect(v.entries).toBe(1);
    expect(v.patterns).toEqual([]);
  });

  it('only an upcoming visit (nothing in the past) is not enough', () => {
    const v = view({ visits: [{ id: 'v', date: '2026-12-01', priorities: ['Headaches'] }] });
    expect(v.enough).toBe(false);
    expect(v.entries).toBe(0);
  });

  it('two entries with nothing in common: enough, but no patterns are invented', () => {
    const v = view({ evidence: [ev('a', '2026-10-01', 'note', 'Started a new job'), ev('b', '2026-11-01', 'symptom', 'Headaches')] });
    expect(v.enough).toBe(true);
    expect(v.patterns).toEqual([]);
  });
});

describe('case view: patterns', () => {
  it('timing: a symptom that began after a medication change, with both entries as evidence', () => {
    const v = view({ evidence: [ev('m', '2026-10-01', 'medication', 'Sertraline started'), ev('s', '2026-10-04', 'symptom', 'Trouble sleeping')] });
    expect(v.patterns).toEqual([{
      id: 'timing-s', kind: 'timing',
      text: 'Oct 4: "Trouble sleeping". That was 3 days after a medication change ("Sertraline started", Oct 1).',
      refs: [{ kind: 'evidence', id: 'm' }, { kind: 'evidence', id: 's' }],
    }]);
  });

  it('timing: same day, and a symptom before the change does not count', () => {
    const same = view({ evidence: [ev('m', '2026-10-01', 'medication', 'Dose up'), ev('s', '2026-10-01', 'symptom', 'Dizzy')] });
    expect(same.patterns[0].text).toContain('the same day as');
    const before = view({ evidence: [ev('s', '2026-09-20', 'symptom', 'Dizzy'), ev('m', '2026-10-01', 'medication', 'Dose up')] });
    expect(before.patterns).toEqual([]);
  });

  it('timing: outside the 60-day window is not linked', () => {
    const v = view({ evidence: [ev('m', '2026-01-01', 'medication', 'Dose up'), ev('s', '2026-06-01', 'symptom', 'Dizzy')] });
    expect(v.patterns).toEqual([]);
  });

  it('timing: a "Story saved" entry is not treated as a symptom starting', () => {
    const v = view({ evidence: [ev('m', '2026-10-01', 'medication', 'Dose up'), ev('s', '2026-10-05', 'symptom', 'Over-sedation', 'Story saved')] });
    expect(v.patterns).toEqual([]);
  });

  it('timing: uses the medicines list when the change is not on the timeline', () => {
    const v = view({ medications: [{ id: 'med', name: 'Lisinopril', dose: '10 mg', started: '2026-10-01' }], evidence: [ev('s', '2026-10-10', 'symptom', 'Dry cough')] });
    expect(v.patterns[0].refs).toEqual([{ kind: 'medication', id: 'med' }, { kind: 'evidence', id: 's' }]);
    expect(v.patterns[0].text).toContain('"Lisinopril 10 mg"');
  });

  it('raised again: the same concern at two visits', () => {
    const v = view({ visits: [
      { id: 'v1', date: '2026-09-01', priorities: ['Headaches every morning since August'] },
      { id: 'v2', date: '2026-11-01', priorities: ['Morning headaches are worse'] },
    ] });
    expect(v.patterns).toEqual([{ id: 'raised-v1-0', kind: 'raised-again', text: 'You\'ve brought up "Headaches every morning since August" at 2 visits (Sep 1, Nov 1).', refs: [{ kind: 'visit', id: 'v1' }, { kind: 'visit', id: 'v2' }] }]);
  });

  it('felt unheard at two visits is a pattern; at one visit it is not', () => {
    const one = view({ visits: [{ id: 'a', date: '2026-09-01', priorities: [], checkIn: { feltHeard: 1 } }, { id: 'b', date: '2026-10-01', priorities: [], checkIn: { feltHeard: 4 } }] });
    expect(one.patterns).toEqual([]);
    const two = view({ visits: [{ id: 'a', date: '2026-09-01', priorities: [], checkIn: { feltHeard: 1 } }, { id: 'b', date: '2026-10-01', priorities: [], checkIn: { feltHeard: 2 } }] });
    expect(two.patterns[0].text).toBe('You felt heard 2 out of 5 or less at 2 visits (Sep 1, Oct 1).');
  });

  it('same concern matcher needs two shared content words', () => {
    expect(sameConcern('Dizzy when standing up', 'Dizzy when I stand')).toBe(false);
    expect(sameConcern('Daytime sleepiness since the dose change', 'Daytime sleepiness at work')).toBe(true);
  });
});

describe('case view: open questions and highlights', () => {
  const base = { evidence: [ev('a', '2026-10-01', 'note', 'x'), ev('b', '2026-10-02', 'note', 'y')] };

  it('an overdue next step with no outcome, and one that did not happen, are open', () => {
    const v = view({ ...base, followUps: [
      { id: 'f1', step: 'Blood test', dueDate: '2026-11-01' },
      { id: 'f2', step: 'Therapist referral', dueDate: '2026-11-10', outcome: 'Didn’t happen' },
      { id: 'f3', step: 'Follow-up visit', dueDate: '2026-12-01' },
      { id: 'f4', step: 'X-ray', dueDate: '2026-10-01', outcome: 'Happened' },
    ] });
    expect(v.openQuestions.map((q) => q.id)).toEqual(['overdue-f1', 'overdue-f2']);
    expect(v.openQuestions[0].why).toBe('It was due Nov 1 and isn\'t marked done.');
    expect(v.openQuestions[1].why).toBe('You logged that it didn\'t happen (it was due Nov 10).');
  });

  it('talking points that never came up at the last visit are open', () => {
    const v = view({ ...base, visits: [{ id: 'v', date: '2026-11-01', priorities: ['Dizzy', 'Sleep'], covered: ['Sleep'] }] });
    expect(v.openQuestions).toEqual([{ id: 'not-covered-v-0', kind: 'not-covered', text: '"Dizzy" didn\'t come up yet.', why: 'It was a talking point for your visit on Nov 1.', refs: [{ kind: 'visit', id: 'v' }] }]);
  });

  it('highlights keep the most recent few, oldest first', () => {
    const visits = Array.from({ length: 9 }, (_, i) => ({ id: `v${i}`, date: `2026-0${i + 1}-01`, priorities: [] }));
    const v = view({ visits });
    expect(v.highlights).toHaveLength(MAX_HIGHLIGHTS);
    expect(v.highlights[0].date).toBe('2026-04-01');
    expect(v.highlights.at(-1)!.date).toBe('2026-09-01');
  });
});

describe('case view: safety', () => {
  it('crisis language anywhere in the record → crisis, nothing built', () => {
    expect(buildCaseView({ ...EMPTY, evidence: [ev('a', '2026-10-01', 'note', 'I want to hurt myself'), ev('b', '2026-10-02', 'note', 'x')] }, TODAY)).toEqual({ status: 'crisis' });
  });

  it('never says a medicine caused anything', () => {
    const theo = view(buildTheoRecord() as unknown as CaseInputs, todayISO());
    const all = [...theo.patterns.map((p) => p.text), ...theo.openQuestions.flatMap((q) => [q.text, q.why]), ...theo.highlights.map((h) => h.text)].join(' ');
    expect(all).not.toMatch(/\b(caus|because|due to|side effect)/i);
  });
});

describe("case view: Theo's record", () => {
  it('finds the dose-change timing and the repeated concern', () => {
    const v = view(buildTheoRecord() as unknown as CaseInputs, todayISO());
    expect(v.enough).toBe(true);
    expect(v.patterns.map((p) => p.kind)).toEqual(['timing', 'raised-again']);
    expect(v.patterns[0].text).toMatch(/"Daytime sleepiness and dizziness on standing began"\. That was 2 days after a medication change \("Ziprasidone dose increased"/);
    expect(v.highlights.map((h) => h.text)).toEqual(['Medication change: Ziprasidone dose increased', 'First symptom noted: Daytime sleepiness and dizziness on standing began', 'Visit with Dr. Lane · felt heard 2/5']);
  });
});
