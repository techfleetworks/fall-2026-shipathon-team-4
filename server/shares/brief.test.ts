import { describe, expect, it } from 'vitest';
import { buildOnePageBrief, ONE_PAGE } from './brief.js';

const base = {
  who: 'Theo, 30',
  priorities: ['Sleepiness since the dose change'],
  symptoms: [{ label: 'Reported', clinical: 'Over-sedation / excessive daytime somnolence', quote: 'The meds make me a zombie' }],
  tried: 'Ziprasidone 40 mg',
  timeline: [{ date: '2026-10-01', detail: 'Dose went up' }],
  askingFor: ['Check standing blood pressure'],
  demo: false,
};

describe('buildOnePageBrief', () => {
  it('keeps a brief that already fits, unchanged', () => {
    expect(buildOnePageBrief(base)).toEqual({ ok: true, brief: base, trimmed: false });
  });

  it('caps every list at what fits on one page', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `item ${i + 1}`);
    const out = buildOnePageBrief({
      ...base,
      priorities: many(10),
      symptoms: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, clinical: 'x' })),
      timeline: Array.from({ length: 10 }, () => ({ date: '2026-10-01', detail: 'd' })),
      askingFor: many(10),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.trimmed).toBe(true);
    expect(out.brief.priorities).toEqual(['item 1', 'item 2', 'item 3']);
    expect(out.brief.symptoms).toHaveLength(ONE_PAGE.symptoms.max);
    expect(out.brief.timeline).toHaveLength(ONE_PAGE.timeline.max);
    expect(out.brief.askingFor).toHaveLength(ONE_PAGE.askingFor.max);
  });

  it('shortens long text with "…" instead of rejecting it', () => {
    const out = buildOnePageBrief({ ...base, symptoms: [{ ...base.symptoms[0], quote: 'word '.repeat(200) }] });
    expect(out.ok && out.trimmed).toBe(true);
    const quote = out.ok ? out.brief.symptoms[0].quote! : '';
    expect(quote.length).toBeLessThanOrEqual(ONE_PAGE.symptoms.quote);
    expect(quote.endsWith('…')).toBe(true);
  });

  it('drops fields it does not know (no mass assignment)', () => {
    const out = buildOnePageBrief({ ...base, isAdmin: true, symptoms: [{ ...base.symptoms[0], html: '<script>' }] });
    expect(out.ok && JSON.stringify(out.brief)).not.toMatch(/isAdmin|script/);
  });

  it.each([
    ['not an object', 'brief'],
    ['priorities that are not a list', { ...base, priorities: 'a' }],
    ['a number where text belongs', { ...base, tried: 7 }],
    ['a symptom that is not an object', { ...base, symptoms: ['x'] }],
    ['a bad timeline date', { ...base, timeline: [{ date: 'yesterday', detail: 'x' }] }],
    ['a bad visit date', { ...base, visitDate: '14/11/2026' }],
    ['a huge text', { ...base, tried: 'x'.repeat(5001) }],
    ['a huge list', { ...base, priorities: Array.from({ length: 51 }, () => 'p') }],
    ['a non-boolean flag', { ...base, demo: 'yes' }],
  ])('rejects %s', (_name, input) => {
    expect(buildOnePageBrief(input)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses to share crisis language anywhere in the brief', () => {
    expect(buildOnePageBrief({ ...base, symptoms: [{ label: 'Reported', clinical: 'x', quote: "I don't see the point anymore" }] })).toEqual({ ok: false, reason: 'crisis' });
  });

  it('calls a brief with nothing to discuss empty', () => {
    expect(buildOnePageBrief({ who: 'Theo', priorities: [], symptoms: [], tried: 'Not discussed', timeline: [], askingFor: [], demo: false })).toEqual({ ok: false, reason: 'empty' });
  });
});
