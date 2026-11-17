import { describe, expect, it } from 'vitest';
import { buildTheoRecord } from '../../server/demo/theoRecord.js';
import { buildBriefSnapshot } from './brief.js';
import { ONE_PAGE, buildOnePageBrief, fitToOnePage } from './onePageBrief.js';
import type { AppData } from './store.js';
import type { BriefSnapshot } from './types.js';

const theo = () => buildTheoRecord() as unknown as AppData;
const base = (): BriefSnapshot => ({
  who: 'Theo, 30 · Visit Dec 5',
  patient: 'Theo, 30',
  impact: 'Work or school',
  priorities: ['Daytime sleepiness since the dose change'],
  symptoms: [{ label: 'Reported', clinical: 'Over-sedation / excessive daytime somnolence' }],
  tried: 'Ziprasidone, dose increased',
  timeline: [],
  askingFor: ['Medication review'],
  demo: true,
});

describe('one-page brief keeps every field the doctor view shows', () => {
  it('keeps the patient (name, age) and Daily impact (they were dropped before)', () => {
    const out = buildOnePageBrief(base());
    expect(out.ok && out.brief.patient).toBe('Theo, 30');
    expect(out.ok && out.brief.impact).toBe('Work or school');
  });

  it('shortens an over-long Daily impact and says it trimmed', () => {
    const out = buildOnePageBrief({ ...base(), impact: 'x'.repeat(ONE_PAGE.impact + 50) });
    expect(out.ok && out.brief.impact!.length).toBe(ONE_PAGE.impact);
    expect(out.ok && out.trimmed).toBe(true);
  });

  it('crisis words in Daily impact → not shared', () => {
    expect(buildOnePageBrief({ ...base(), impact: 'I want to hurt myself' })).toEqual({ ok: false, reason: 'crisis' });
  });
});

describe('fitToOnePage (Download PDF)', () => {
  it('caps lists and long text with the same rules as shared links', () => {
    const long = { ...base(), priorities: ['a', 'b', 'c', 'd', 'e'], symptoms: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, clinical: 'x'.repeat(400) })) };
    const { brief, trimmed } = fitToOnePage(long);
    expect(brief.priorities).toHaveLength(ONE_PAGE.priorities.max);
    expect(brief.symptoms).toHaveLength(ONE_PAGE.symptoms.max);
    expect(brief.symptoms[0].clinical.length).toBe(ONE_PAGE.symptoms.clinical);
    expect(trimmed).toBe(true);
  });

  it('a brief that already fits is printed unchanged', () => {
    expect(fitToOnePage(base())).toEqual({ brief: buildOnePageBrief(base()).ok && (buildOnePageBrief(base()) as { brief: BriefSnapshot }).brief, trimmed: false });
    expect(fitToOnePage(base()).brief.patient).toBe('Theo, 30');
  });

  it('never hides what the patient asked to print: if it cannot be fitted, it prints as-is', () => {
    const empty = { ...base(), priorities: [], symptoms: [], askingFor: [], tried: '' };
    expect(fitToOnePage(empty)).toEqual({ brief: empty, trimmed: false });
  });

  it("Theo's real brief, with Case history ticked, keeps the case for page 2", () => {
    const s = theo();
    const visit = s.visits.find((v) => v.date >= new Date().toISOString().slice(0, 10))!;
    const snap = buildBriefSnapshot(s, visit, { talkingPoints: true, summary: true, caseHistory: true });
    expect(snap.case?.patterns.length).toBeGreaterThan(0);
    const { brief } = fitToOnePage(snap);
    expect(brief.case?.patterns).toEqual(snap.case!.patterns);
    expect(brief.patient).toBe(snap.patient);
  });

  it('Case history not ticked → no case in the PDF', () => {
    const s = theo();
    const snap = buildBriefSnapshot(s, undefined, { talkingPoints: true, summary: true });
    expect(snap.case).toBeUndefined();
  });
});
