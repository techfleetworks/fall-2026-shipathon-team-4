import { describe, expect, it } from 'vitest';
import { THEO_PREP } from '../../data/evalScenarios';
import { ENGINE_VOCABULARY } from '../engine';
import { checkOutput } from '../guardrails';
import { hasCrisisLanguage } from '../safety';
import { explainClinical, findTerms } from './explain';
import { GLOSSARY, plainFor } from './glossary';

/** Theo's clinical note from the Synthetic Data Starter Pack (clinical_note.txt), verbatim. */
const THEO_NOTE =
  '30 y/o male, h/o mood disorder, on ziprasidone 5/52. Reports daytime somnolence and light-headedness, query medication side effect vs. depressive anergia; ?orthostatic hypotension, postural BP not repeated today. Advised to continue current dose, RV in 4/52. Metabolic parameters trending up; consider monitoring.';

/** A sample text each entry should match, to get its explanation (numbered shorthand needs a real match). */
function sampleFor(id: string): string {
  const samples: Record<string, string> = { age: '30 y/o', weeks: '5/52', query: 'query', versus: 'A vs. B' };
  return samples[id] ?? GLOSSARY.find((g) => g.id === id)!.term;
}

const ids = (text: string) => findTerms(text).map((e) => e.id);

describe('glossary: every explanation obeys the rules', () => {
  it.each(GLOSSARY.map((g) => [g.id]))('%s matches its own sample and passes every guardrail check, with nothing to echo', (id) => {
    const entry = GLOSSARY.find((g) => g.id === id)!;
    const sample = sampleFor(id);
    const m = new RegExp(entry.match.source, entry.match.flags).exec(sample);
    expect(m, `"${sample}" should match ${entry.match}`).not.toBeNull();
    const plain = plainFor(entry, m!);
    // Strict: empty input, so not even an echo of the reader's own words is allowed.
    expect(checkOutput(plain, { input: '' }).violations).toEqual([]);
    expect(hasCrisisLanguage(plain)).toBe(false);
    expect(plain.length).toBeLessThanOrEqual(200);
    expect(plain).not.toMatch(/^you\b|\byou (?:have|are|should)\b/i);
  });

  it('has unique ids', () => {
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
  });

  it.each(ENGINE_VOCABULARY.map((t) => [t]))('explains the app’s own doctor-terms line %j', (term) => {
    expect(findTerms(term).filter((e) => e.kind === 'term').length).toBeGreaterThan(0);
  });
});

describe('explainClinical', () => {
  it('explains Theo’s whole clinical note, in reading order', () => {
    const out = explainClinical(THEO_NOTE);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.explanations.map((e) => e.found)).toEqual([
      '30 y/o', 'h/o', 'mood disorder', '5/52', 'somnolence', 'query', 'side effect', 'vs.', 'anergia',
      'orthostatic hypotension', 'postural BP', 'RV', '4/52', 'Metabolic', 'monitoring',
    ]);
    const plain = Object.fromEntries(out.explanations.map((e) => [e.found, e.plain]));
    expect(plain['5/52']).toMatch(/^5 weeks\./);
    expect(plain['4/52']).toMatch(/^4 weeks\./);
    expect(plain['30 y/o']).toBe('30 years old.');
  });

  it('explains the lab names in labs.csv', () => {
    expect(ids('Fasting glucose 104 mg/dL; Total cholesterol 214 mg/dL; Prolactin 18 ng/mL')).toEqual(['fasting-glucose', 'cholesterol', 'prolactin']);
  });

  it('prefers the longer, more specific term over a shorter one inside it', () => {
    expect(ids('postural BP not repeated')).toEqual(['postural-bp']);
    expect(ids('?orthostatic hypotension')).toEqual(['query', 'orthostatic-hypotension']);
    expect(ids('orthostatic symptoms')).toEqual(['orthostatic']);
  });

  it('explains a term once, but each different number of weeks', () => {
    expect(ids('somnolence ... somnolence again')).toEqual(['somnolence']);
    expect(findTerms('RV in 4/52, then 4/52, then 6/52').map((e) => e.found)).toEqual(['RV', '4/52', '6/52']);
  });

  it.each([
    ['ordinary words', 'I went to the shop and felt fine'],
    ['lowercase letters that look like shorthand', 'the bp of a rv park'],
    ['a date', 'Seen on 11/12 at 3pm'],
    ['a sentence ending in a question mark', 'Could it be the meds?'],
  ])('explains nothing in %s', (_name, text) => {
    expect(explainClinical(text)).toEqual({ status: 'ok', explanations: [] });
  });

  it('takes the crisis path instead of explaining', () => {
    expect(explainClinical(`${THEO_NOTE} I don't see the point anymore`)).toEqual({ status: 'crisis' });
  });

  it('allows the patient’s own condition and medication names in the text around the terms', () => {
    // The note names ziprasidone and a condition; the explanations never repeat or add them.
    const out = explainClinical(THEO_NOTE);
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.explanations.map((e) => e.plain).join(' ')).not.toMatch(/ziprasidone|disorder/i);
  });

  it('explains Theo’s prep notes too (plain words in, nothing invented)', () => {
    expect(explainClinical(THEO_PREP.noticing)).toEqual({ status: 'ok', explanations: [] });
  });
});
