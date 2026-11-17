import { describe, expect, it } from 'vitest';
import { LIVE_START, MAX_SEGMENT_CHARS, onResults, onSessionEnd, toSentences, type SpeechResult } from './live.js';

const r = (transcript: string, isFinal: boolean): SpeechResult => ({ transcript, isFinal });

describe('live transcript: partial vs final', () => {
  it('shows interim words right away, but saves nothing until they are final', () => {
    const s = onResults(LIVE_START, [r('I have been', false)]);
    expect(s.interim).toBe('I have been');
    expect(s.segments).toEqual([]);
  });

  it('interim words are replaced as the browser revises them', () => {
    let s = onResults(LIVE_START, [r('I have bean', false)]);
    s = onResults(s, [r('I have been dizzy', false)]);
    expect(s.interim).toBe('I have been dizzy');
    expect(s.segments).toEqual([]);
  });

  it('a final result is saved once, even though the browser sends the whole list every time', () => {
    let s = onResults(LIVE_START, [r('I have been dizzy', true)]);
    s = onResults(s, [r('I have been dizzy', true), r('when I stand', false)]);
    s = onResults(s, [r('I have been dizzy', true), r('when I stand up', true)]);
    expect(s.segments).toEqual(['I have been dizzy', 'when I stand up']);
    expect(s.interim).toBe('');
    expect(s.consumed).toBe(2);
  });

  it('keeps order: a final after a still-interim result waits for it', () => {
    let s = onResults(LIVE_START, [r('first part', false), r('second part', true)]);
    expect(s.segments).toEqual([]);
    expect(s.interim).toBe('first part second part');
    s = onResults(s, [r('first part', true), r('second part', true)]);
    expect(s.segments).toEqual(['first part', 'second part']);
  });
});

describe('live transcript: sessions end and restart', () => {
  it('words still interim when a session ends are kept, and counting restarts', () => {
    let s = onResults(LIVE_START, [r('the dose went up', true), r('five weeks ago', false)]);
    s = onSessionEnd(s);
    expect(s.segments).toEqual(['the dose went up', 'five weeks ago']);
    expect(s).toMatchObject({ interim: '', consumed: 0 });
    // The next session's results start from zero again.
    s = onResults(s, [r('and I fall asleep at work', true)]);
    expect(s.segments).toEqual(['the dose went up', 'five weeks ago', 'and I fall asleep at work']);
  });

  it('a phrase the browser reports twice is saved once', () => {
    let s = onResults(LIVE_START, [r('Dizzy when standing.', true)]);
    s = onSessionEnd(s);
    s = onResults(s, [r('dizzy when standing', true)]);
    expect(s.segments).toEqual(['Dizzy when standing.']);
  });

  it('empty results and whitespace are ignored; long results are capped', () => {
    let s = onResults(LIVE_START, [r('   ', true), r('x'.repeat(MAX_SEGMENT_CHARS + 500), true)]);
    s = onSessionEnd(s);
    expect(s.segments).toHaveLength(1);
    expect(s.segments[0].length).toBe(MAX_SEGMENT_CHARS);
  });
});

describe('toSentences (for the recap)', () => {
  it('capitalizes, adds a period, keeps questions, drops tiny fragments', () => {
    expect(toSentences(['the dose went up', 'um', 'could it be the medicine?', 'OK. We will check your blood pressure'])).toEqual([
      'The dose went up.',
      'Could it be the medicine?',
      'We will check your blood pressure.',
    ]);
  });
});
