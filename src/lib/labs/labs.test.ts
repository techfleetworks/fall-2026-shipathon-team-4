import { describe, expect, it } from 'vitest';
import { THEO_CLINICAL_NOTE, THEO_LABS, THEO_LABS_CSV } from '../../data/sampleResults';
import { checkOutput } from '../guardrails';
import { explainLab, explainLabs, parseLabsCsv, parseRange, type LabRow } from './labs';
import { explainResults } from './results';

const row = (value: string, typicalRange?: string, test = 'Fasting glucose'): LabRow => ({ test, value, ...(typicalRange !== undefined ? { typicalRange } : {}) });

describe('explainLab: where a value sits against the range shown', () => {
  it.each([
    ['above a between-range', row('104 mg/dL', '70-99'), 'above', '104 mg/dL is above the typical range shown (70-99).'],
    ['within a between-range', row('88 mg/dL', '70–99 mg/dL'), 'within', '88 mg/dL is within the typical range shown (70–99 mg/dL).'],
    ['below a between-range', row('65 mg/dL', '70 to 99'), 'below', '65 mg/dL is below the typical range shown (70 to 99).'],
    ['on the edge (inclusive)', row('99 mg/dL', '70-99'), 'within', '99 mg/dL is within the typical range shown (70-99).'],
    ['above an upper bound', row('214 mg/dL', '< 200'), 'above', '214 mg/dL is above the typical range shown (< 200).'],
    ['under an upper bound', row('180 mg/dL', '<200'), 'within', '180 mg/dL is within the typical range shown (<200).'],
    ['below a lower bound', row('35 mg/dL', '> 40'), 'below', '35 mg/dL is below the typical range shown (> 40).'],
    ['a decimal value', row('5.9 %', '4.0-5.6 %'), 'above', '5.9 % is above the typical range shown (4.0-5.6 %).'],
  ])('%s', (_name, r, position, summary) => {
    expect(explainLab(r)).toMatchObject({ position, summary });
  });

  it('describes a before → after reading as a change, with no judgment', () => {
    const out = explainLab(THEO_LABS[0]);
    expect(out.position).toBe('change');
    expect(out.summary).toBe('The top number went from 118 to 98 (down 20), and the bottom number from 76 to 64 (down 12).');
    expect(explainLab(row('80 -> 82 kg', undefined, 'Weight')).summary).toBe('It went from 80 to 82 (up 2).');
  });

  it.each([
    ['no range at all', row('+11 lb in 5 weeks')],
    ['a dash', row('+11 lb in 5 weeks', '—')],
    ['"n/a"', row('+11 lb in 5 weeks', 'N/A')],
  ])('says there is nothing to compare with %s', (_name, r) => {
    expect(explainLab(r).position).toBe('no-range');
  });

  it.each([
    ['different units', row('5.8 mmol/L', '70-99 mg/dL')],
    ['a range in words', row('104 mg/dL', 'normal')],
    ['a value with no number', row('positive', '0-1')],
    ['a backwards range', row('104 mg/dL', '99-70')],
  ])('does not guess with %s', (_name, r) => {
    expect(explainLab(r)).toMatchObject({ position: 'not-compared' });
  });

  it('adds what the test measures, from the glossary', () => {
    expect(explainLab(row('104 mg/dL', '70-99')).about).toBe('Blood sugar measured after not eating, usually overnight.');
    expect(explainLab(row('3', '1-5', 'Mystery panel'))).not.toHaveProperty('about');
  });
});

describe('explainLabs: Theo’s labs (Starter Pack)', () => {
  it('reads every row, guarded', () => {
    const out = explainLabs(THEO_LABS);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.labs.map((l) => [l.test, l.position])).toEqual([
      ['Blood pressure (sitting -> standing)', 'change'],
      ['Fasting glucose', 'above'],
      ['Total cholesterol', 'above'],
      ['Weight change', 'no-range'],
      ['Prolactin', 'above'],
    ]);
    expect(out.labs.every((l) => l.about)).toBe(true);
  });

  it('never says what a result means for the person or what to do', () => {
    const out = explainLabs(THEO_LABS);
    const text = out.status === 'ok' ? out.labs.flatMap((l) => [l.summary, l.about]).join(' ') : '';
    expect(text).not.toMatch(/\byou\b|\byour\b|risk|danger|worry|normal|abnormal|elevated|monitor|should|diabet|hypotension/i);
    expect(checkOutput(text, { input: '' }).violations.filter((v) => v.rule !== 'no-dosing')).toEqual([]);
  });

  it('takes the crisis path when crisis words are in the input', () => {
    expect(explainLabs([row("I don't see the point anymore", '70-99')])).toEqual({ status: 'crisis' });
  });
});

describe('parseRange and parseLabsCsv', () => {
  it.each([
    ['70-99', { low: 70, high: 99 }],
    ['< 200', { high: 200 }],
    ['>= 40 mg/dL', { low: 40 }],
    ['small drop', undefined],
    ['', undefined],
  ])('reads %j', (text, expected) => {
    const r = parseRange(text);
    if (expected === undefined) expect(r).toBeUndefined();
    else expect(r).toMatchObject(expected);
  });

  it('reads labs.csv exactly, ignoring the plain_meaning column', () => {
    const rows = parseLabsCsv(THEO_LABS_CSV);
    expect(rows).toEqual(THEO_LABS);
    expect(JSON.stringify(rows)).not.toMatch(/worth monitoring|Mildly elevated/);
  });

  it('handles quoted cells and refuses an unknown header', () => {
    expect(parseLabsCsv('test,value,typical_range\n"Glucose, fasting","104 mg/dL","70-99"')).toEqual([
      { test: 'Glucose, fasting', value: '104 mg/dL', typicalRange: '70-99' },
    ]);
    expect(parseLabsCsv('name,result\nA,1')).toBeUndefined();
    expect(parseLabsCsv('')).toBeUndefined();
  });
});

describe('explainResults: labs + note together', () => {
  it('explains Theo’s labs and clinical note in one answer', () => {
    const out = explainResults({ labs: THEO_LABS, note: THEO_CLINICAL_NOTE });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.labs).toHaveLength(5);
      expect(out.note.map((e) => e.found)).toContain('orthostatic hypotension');
    }
  });

  it('takes the crisis path for the whole request if the note has crisis words', () => {
    expect(explainResults({ labs: THEO_LABS, note: 'I want to hurt myself' })).toEqual({ status: 'crisis' });
  });

  it('works with only one of the two', () => {
    expect(explainResults({ note: 'RV in 4/52' })).toMatchObject({ status: 'ok', labs: [] });
    expect(explainResults({ labs: THEO_LABS })).toMatchObject({ status: 'ok', note: [] });
  });
});
