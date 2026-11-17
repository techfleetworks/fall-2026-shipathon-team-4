import { describe, expect, it } from 'vitest';
import { createLiveCapture, type RecognizerLike } from './liveCapture.js';
import type { LiveState } from './live.js';

/** A fake microphone: the test says what the browser "heard". */
class FakeRecognizer implements RecognizerLike {
  static last: FakeRecognizer;
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: RecognizerLike['onresult'] = null;
  onend: RecognizerLike['onend'] = null;
  onerror: RecognizerLike['onerror'] = null;
  starts = 0;
  stops = 0;
  constructor() { FakeRecognizer.last = this; }
  start() { this.starts++; }
  stop() { this.stops++; }
  hear(...results: [string, boolean][]) {
    const list = results.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal }));
    this.onresult?.({ results: list });
  }
  silence() { this.onend?.(); }
}

function setup(initial: string[] = []) {
  const saves: string[][] = [];
  const states: LiveState[] = [];
  const cap = createLiveCapture({ Recognizer: FakeRecognizer, initial, onState: (s) => states.push(s), onSave: (s) => saves.push(s) });
  return { cap, saves, states, mic: () => FakeRecognizer.last };
}

describe('live capture controller (fake microphone)', () => {
  it('turns on live words and continuous listening', () => {
    const { cap, mic } = setup();
    cap.listen();
    expect(mic()).toMatchObject({ interimResults: true, continuous: true, lang: 'en-US', starts: 1 });
  });

  it('shows words as they are spoken, and saves each finished piece right away', () => {
    const { cap, saves, states, mic } = setup();
    cap.listen();
    mic().hear(['I have been', false]);
    expect(states.at(-1)!.interim).toBe('I have been');
    expect(saves).toEqual([]); // nothing saved while words are still changing
    mic().hear(['I have been dizzy', true]);
    expect(saves.at(-1)).toEqual(['I have been dizzy']); // saved the moment it is final
  });

  it('keeps listening after a silence, and keeps unfinished words', () => {
    const { cap, saves, mic } = setup();
    cap.listen();
    mic().hear(['the dose went up', true], ['five weeks', false]);
    mic().silence();
    expect(mic().starts).toBe(2); // restarted
    expect(saves.at(-1)).toEqual(['the dose went up', 'five weeks']);
  });

  it('pause keeps unfinished words and stops; events after that are ignored', () => {
    const { cap, saves, mic } = setup();
    const pause = cap.listen();
    mic().hear(['when I stand up', false]);
    const m = mic();
    pause();
    expect(m.stops).toBe(1);
    expect(saves.at(-1)).toEqual(['when I stand up']);
    m.hear(['late words', true]);
    m.silence();
    expect(saves.at(-1)).toEqual(['when I stand up']);
    expect(m.starts).toBe(1); // not restarted after pausing
  });

  it('resume continues the same record', () => {
    const { cap, mic } = setup();
    cap.listen()();
    cap.listen();
    mic().hear(['after the pause', true]);
    expect(cap.state().segments).toEqual(['after the pause']);
  });

  it('stop returns recap sentences and clears what was saved', () => {
    const { cap, saves, mic } = setup();
    const end = cap.listen();
    mic().hear(['we will check your blood pressure', true], ['standing up', false]);
    end();
    expect(cap.take()).toEqual(['We will check your blood pressure.', 'Standing up.']);
    expect(saves.at(-1)).toEqual([]);
  });

  it('after the page closed: pieces saved before are recovered into the recap', () => {
    const { cap, saves } = setup(['the dose went up', 'and I feel dizzy']);
    expect(cap.take()).toEqual(['The dose went up.', 'And I feel dizzy.']);
    expect(saves.at(-1)).toEqual([]);
  });

  it('nothing heard, nothing saved', () => {
    const { cap, saves } = setup();
    cap.listen()();
    expect(cap.take()).toEqual([]);
    expect(saves.every((s) => s.length === 0)).toBe(true);
  });
});
