import { describe, expect, it } from 'vitest';
import { buildTheoRecord } from '../../../server/demo/theoRecord';
import { buildDemoState } from '../../data/demo';
import { readingGrade, TARGET_GRADE } from '../afterVisit/readability';
import { REVERSE_PAIRS } from '../afterVisit/reversePairs';
import { todayISO } from '../dates';
import { checkOutput } from '../guardrails';
import type { Evidence, Visit } from '../types';
import { firstPerson, MAX_SUGGESTIONS, suggestQuestions, type QuestionInputs } from './suggest';

const today = todayISO();
const theo = buildTheoRecord() as unknown as QuestionInputs;
const nextVisit = (r: QuestionInputs) => r.visits.find((v) => v.date >= today)!;
const empty: QuestionInputs = { visits: [], evidence: [], summaries: [] };
const visit = (patch: Partial<Visit> = {}): Visit => ({ id: 'next', date: today, priorities: [], askingFor: [], ...patch });

describe('suggestQuestions: Theo (server record, with his after-visit summary)', () => {
  const qs = suggestQuestions(theo, nextVisit(theo), today);

  it('suggests questions from what was not covered, his timeline, and last visit', () => {
    expect(qs.map((q) => q.id)).toEqual(['uncovered-orthostatic', 'standing-bp', 'medicine-cause', 'what-else', 'if-not-better']);
    expect(qs[0].text).toBe('Last time we did not talk about feeling dizzy when I stand up. Can we talk about it today?');
  });

  it('says why each one is suggested, from his own record', () => {
    expect(qs.find((q) => q.id === 'medicine-cause')!.why).toMatch(/^Your timeline: medicine changed \w{3} \d+, symptoms began \w{3} \d+\.$/);
    expect(qs.find((q) => q.id === 'what-else')!.why).toBe('At your last visit it was put down to the depression.');
    expect(qs.find((q) => q.id === 'if-not-better')!.why).toBe('Plan from your last visit: check again next month.');
  });

  it('skips a question he already has as a talking point (the options question)', () => {
    expect(qs.some((q) => q.id === 'options')).toBe(false);
    expect(suggestQuestions(theo, { ...nextVisit(theo), priorities: [] }, today).some((q) => q.id === 'options')).toBe(true);
  });

  it('never names his medicine', () => {
    expect(JSON.stringify(qs)).not.toMatch(/ziprasidone/i);
  });
});

describe('suggestQuestions: grounded only in the record', () => {
  it('works from the timeline alone (built-in Theo, no after-visit summary)', () => {
    const b = buildDemoState() as unknown as QuestionInputs;
    const ids = suggestQuestions(b, visit(), today).map((q) => q.id);
    expect(ids).toContain('medicine-cause');
    expect(ids).toContain('what-else');
    expect(ids).not.toContain('uncovered-orthostatic');
  });

  it('suggests nothing for someone with no history', () => {
    expect(suggestQuestions(empty, visit(), today)).toEqual([]);
  });

  it('does not tie symptoms to a medicine change months earlier', () => {
    const evidence: Evidence[] = [
      { id: '1', date: '2026-01-01', type: 'medication', title: 'Medication', detail: 'Started a medicine' },
      { id: '2', date: '2026-09-01', type: 'symptom', title: 'Symptom', detail: 'Headaches began' },
    ];
    expect(suggestQuestions({ ...empty, evidence }, visit(), today).map((q) => q.id)).not.toContain('medicine-cause');
  });

  it('caps the list', () => {
    expect(suggestQuestions(theo, visit({ date: '2099-01-01' }), today).length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });
});

describe('every possible question is simple and safe', () => {
  // Every "not covered" question the rules can produce, plus the fixed ones.
  const all = [
    ...REVERSE_PAIRS.map((p) => `Last time we did not talk about ${firstPerson(p.plain)}. Can we talk about it today?`),
    'Could my blood pressure be dropping when I stand up?',
    'This started right after my medicine changed. Could the medicine be causing it?',
    'What are my choices? A lower dose, a new medicine, or a new time to take it?',
    'If this is not the depression, what else could it be?',
    'If it is not better by then, what will we try next?',
  ];

  it.each(all.map((q) => [q]))('%s', (q) => {
    expect(readingGrade(q)).toBeLessThanOrEqual(TARGET_GRADE);
    expect(checkOutput(q, { input: '' }).violations).toEqual([]);
  });

  it('asks in the patient’s own voice', () => {
    expect(firstPerson('feeling tired, like your body is heavy')).toBe('feeling tired, like my body is heavy');
    expect(firstPerson('not feeling like yourself')).toBe('not feeling like myself');
    expect(firstPerson('losing interest in things you used to enjoy')).toBe('losing interest in things I used to enjoy');
  });
});
