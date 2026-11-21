import { describe, expect, it } from 'vitest';
import { summarizeNotes } from './afterVisit/summary.js';
import { detectCues } from './cues/cues.js';
import { hasCrisisLanguage } from './safety.js';
import { straightQuotes } from './text.js';
import { normalizeTranscript } from './transcript/intake.js';
import { matchSymptoms, quickTranslate } from './translate.js';

// What an iPhone (smart punctuation), Google Docs or Word types instead of a straight apostrophe or quote.
const CURLY = ['’', '‘', 'ʼ', '`'];

describe('straightQuotes', () => {
  it('turns smart single and double quotes into straight ones, and changes nothing else', () => {
    expect(straightQuotes('I can’t sleep, it’s “bad” ‘really’')).toBe('I can\'t sleep, it\'s "bad" \'really\'');
    expect(straightQuotes('Plain text, 7/10, café')).toBe('Plain text, 7/10, café');
  });
});

describe('crisis check: phrases typed on a phone are caught (safety)', () => {
  it.each([
    'I don’t want to be here anymore',
    'I don’t want to live',
    'I can’t see the point',
    'I don’t see any point',
  ])('"%s"', (phrase) => {
    expect(hasCrisisLanguage(phrase)).toBe(true);
  });

  it.each(CURLY)('every kind of smart apostrophe (%s)', (mark) => {
    expect(hasCrisisLanguage(`I don${mark}t want to be here`)).toBe(true);
  });

  it('still not triggered by ordinary sentences', () => {
    expect(hasCrisisLanguage('I can’t sleep and I’m tired all the time')).toBe(false);
  });
});

describe('doctor terms: phone-typed words are recognized', () => {
  it.each([
    ['I can’t sleep', 'Insomnia / sleep disturbance'],
    ['I can’t get out of bed', 'Psychomotor slowing, low energy (anergia)'],
    ['I can’t focus at work', 'Cognitive dulling ("brain fog")'],
    ['I don’t feel like myself', 'Non-specific change from usual self (worth exploring with your clinician)'],
  ])('"%s" → %s', (said, term) => {
    expect(matchSymptoms(said)).toContain(term);
    expect(matchSymptoms(said)).toEqual(matchSymptoms(said.replace('’', "'")));
  });

  it('the quick try on onboarding too', () => {
    expect(quickTranslate('I can’t sleep').map((l) => l.text)).toContain('Insomnia / sleep disturbance');
  });
});

describe('be-believed cues and after-visit summary: phone-typed notes', () => {
  it('a cue is found for "it’s probably the depression"', () => {
    expect(detectCues(['It’s probably the depression'], { priorities: [], covered: [] }).cues.map((c) => c.id)).toEqual(['dismiss-depression']);
  });

  it('the cue still shows the words as they were typed', () => {
    expect(detectCues(['It’s probably the depression'], { priorities: [], covered: [] }).cues[0].heard).toBe('It’s probably the depression');
  });

  it('quick notes with smart quotes summarize like straight ones', () => {
    expect(summarizeNotes('Dr said it’s probably the depression. Follow up in 4 weeks')).toEqual(summarizeNotes("Dr said it's probably the depression. Follow up in 4 weeks"));
  });

  it('crisis words in phone-typed quick notes go to crisis support', () => {
    expect(summarizeNotes('I don’t want to be here')).toEqual({ status: 'crisis' });
  });

  it('pasted transcripts are straightened too', () => {
    expect(normalizeTranscript('Me: I can’t sleep')).toBe("Me: I can't sleep");
  });
});
