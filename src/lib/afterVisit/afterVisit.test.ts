import { describe, expect, it } from 'vitest';
import { TRANSLATION_PAIRS_CSV } from '../../data/evalScenarios';
import { THEO_SAMPLE_TRANSCRIPT } from '../../data/sampleTranscript';
import { checkOutput } from '../guardrails';
import { processTranscript } from '../transcript/intake';
import { TRANSLATION_PAIRS } from '../translate';
import { countSyllables, readingGrade, TARGET_GRADE } from './readability';
import { REVERSE_PAIRS, toPlainWords } from './reversePairs';
import { summarizeNotes, summarizeVisit } from './summary';

const payloadOf = (text: string) => {
  const r = processTranscript(text, 'paste');
  if (r.status !== 'accepted') throw new Error(`transcript not accepted: ${r.status}`);
  return r.payload;
};
const theo = () => payloadOf(THEO_SAMPLE_TRANSCRIPT);

describe('reverse translation pairs (clinical → patient words)', () => {
  it.each(TRANSLATION_PAIRS_CSV.map((p) => [p.clinicalTerm]))('covers the Starter Pack pair %j', (term) => {
    const pair = REVERSE_PAIRS.find((p) => p.csv === term);
    expect(pair, `no reverse pair for ${term}`).toBeDefined();
    // A doctor saying the clinical term is recognized.
    expect(pair!.jargon.test(term)).toBe(true);
  });

  it('covers every approved term in the app’s engine (translate.ts)', () => {
    for (const { clinical } of TRANSLATION_PAIRS) expect(REVERSE_PAIRS.some((p) => p.vocab === clinical), clinical).toBe(true);
  });

  it.each(REVERSE_PAIRS.map((p) => [p.id, p.plain]))('%s: the patient words are simple and break no rule', (_id, plain) => {
    expect(readingGrade(`You talked about ${plain}.`)).toBeLessThanOrEqual(TARGET_GRADE);
    expect(checkOutput(`You talked about ${plain}.`, { input: '' }).violations).toEqual([]);
  });

  it('swaps clinical words in what a doctor said for the patient’s kind of words', () => {
    expect(toPlainWords('Could be orthostatic hypotension, or some akathisia.')).toBe('Could be feeling dizzy when you stand up, or some feeling like you can’t sit still.');
    expect(toPlainWords('No change.')).toBe('No change.');
  });
});

describe('reading level', () => {
  it('counts syllables the usual way', () => {
    expect(['cat', 'table', 'medicine', 'dizzy', 'the', 'pressure'].map(countSyllables)).toEqual([1, 2, 3, 2, 1, 2]);
  });

  it('scores simple text low and clinical text high', () => {
    expect(readingGrade('You feel sleepy. The doctor said to wait.')).toBeLessThanOrEqual(3);
    expect(readingGrade('Patient reports excessive daytime somnolence concurrent with orthostatic hypotension following medication titration.')).toBeGreaterThan(12);
  });
});

describe('summarizeVisit: Theo’s transcript', () => {
  const out = summarizeVisit(theo(), { patientName: 'Theo', talkingPoints: ['Daytime sleepiness since the dose change'] });
  const s = out.status === 'ok' ? out.summary : undefined;

  it('says back what Theo raised, in plain words', () => {
    expect(s?.youRaised).toEqual([
      'You talked about feeling very sleepy in the day.',
      'You talked about feeling dizzy when you stand up.',
      'You said it started after the medicine dose changed.',
      'You asked if the medicine could be causing this.',
    ]);
  });

  it('rewrites what Dr. Lane said in plain words, without judging it', () => {
    expect(s?.doctorSaid).toEqual([
      'The doctor thinks this is from the depression.',
      'The doctor said this is common with depression.',
      'The doctor thinks your body will get used to the medicine in a few weeks.',
      'The doctor said the medicine could be the cause, but still thinks it is the depression.',
    ]);
  });

  it('pulls out the plan', () => {
    expect(s?.plan).toEqual(['Wait and see for now.', 'No change for now.', 'Check again next month.']);
  });

  it('notices what the doctor never talked about (the dizziness on standing)', () => {
    expect(s?.notCovered).toEqual(['The doctor did not talk about feeling dizzy when you stand up.']);
  });

  it('marks his talking point as raised', () => {
    expect(s?.talkingPoints).toEqual([{ text: 'Daytime sleepiness since the dose change', raised: true }]);
  });

  it('reads at a 6th-grade level or below', () => {
    expect(s?.readingGrade).toBeLessThanOrEqual(TARGET_GRADE);
    expect(s?.meetsReadingTarget).toBe(true);
  });

  it('never names the medication or adds advice of its own', () => {
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/ziprasidone|you should|stop taking|\d+\s?mg/i);
  });
});

describe('summarizeVisit: other visits', () => {
  it('turns a jargon-heavy doctor into plain words and keeps the follow-up time', () => {
    const out = summarizeVisit(
      payloadOf('Sam: Thanks for seeing me.\nDr. Kim: Of course.\nSam: My legs won’t stop moving and I get dizzy when I stand.\nDr. Kim: This looks like akathisia, possibly with orthostatic hypotension. We will follow up in two weeks.'),
      { patientName: 'Sam' },
    );
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.summary.doctorSaid).toEqual(['The doctor also said: “This looks like feeling like you can’t sit still, possibly with feeling dizzy when you stand up.”']);
    expect(out.summary.plan).toEqual(['Check again in two weeks.']);
    expect(JSON.stringify(out.summary)).not.toMatch(/akathisia|orthostatic/i);
  });

  it('quotes a sentence it can’t rewrite instead of guessing what it means', () => {
    const out = summarizeVisit(payloadOf('Theo: Hi.\nDr. Lane: Hello there.\nTheo: I feel off.\nDr. Lane: Let us run a thyroid panel and an ECG today.'), { patientName: 'Theo' });
    expect(out.status === 'ok' && out.summary.doctorSaid).toEqual(['The doctor also said: “Let us run a thyroid panel and an ECG today.”']);
  });

  it('lists a talking point that never came up', () => {
    const out = summarizeVisit(theo(), { patientName: 'Theo', talkingPoints: ['My weight has gone up a lot'] });
    expect(out.status === 'ok' && out.summary.notCovered).toContain('This talking point did not come up: My weight has gone up a lot.');
  });

  it('takes the crisis path for crisis language in the visit or the talking points', () => {
    expect(summarizeVisit(payloadOf('Theo: Fine.\nDr. Lane: OK.'), { patientName: 'Theo', talkingPoints: ['I want to hurt myself'] })).toEqual({ status: 'crisis' });
  });
});

describe('summarizeNotes: no recording, just quick notes', () => {
  it('uses the notes, swaps clinical words and pulls out the plan', () => {
    const out = summarizeNotes('- Dr said maybe orthostatic hypotension\n- follow up in 4 weeks', { talkingPoints: ['Dizzy when I stand up', 'Weight gain'] });
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.summary.source).toBe('notes');
    expect(out.summary.doctorSaid).toEqual(['Your notes: Dr said maybe feeling dizzy when you stand up']);
    expect(out.summary.plan).toEqual(['Check again in 4 weeks.']);
    expect(out.summary.notCovered).toEqual(['This talking point is not in your notes: Weight gain.']);
  });

  it('summarizes text with no recognizable dialogue like notes, instead of returning nothing', () => {
    const out = summarizeVisit(payloadOf('Dr said follow up in two weeks.'), { patientName: 'Theo' });
    expect(out.status === 'ok' && out.summary.plan).toEqual(['Check again in two weeks.']);
  });
});
