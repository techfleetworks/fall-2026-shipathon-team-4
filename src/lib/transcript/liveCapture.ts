/**
 * The live capture controller (ADR-021), free of React so it can be tested with a fake recognizer.
 * Owns the listening sessions and the state machine in live.ts; tells the caller what to show and what to save.
 *
 *   listen()  start listening (restarting after silences); returns a function that pauses/stops it, keeping unfinished words
 *   take()    the recap sentences so far; clears everything (also what's saved)
 */
import { LIVE_START, onResults, onSessionEnd, toSentences, type LiveState } from './live.js';

export interface RecognizerLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface LiveCaptureOptions {
  Recognizer: new () => RecognizerLike;
  /** Finished pieces already saved (e.g. before a pause, or before the page closed). */
  initial?: readonly string[];
  /** Called on every change (show `interim` live and the saved count). */
  onState: (s: LiveState) => void;
  /** Called whenever the finished pieces change: save them (on the device). */
  onSave: (segments: string[]) => void;
}

export function createLiveCapture({ Recognizer, initial = [], onState, onSave }: LiveCaptureOptions) {
  let state: LiveState = { ...LIVE_START, segments: [...initial] };

  const set = (next: LiveState) => {
    const grew = next.segments !== state.segments;
    state = next;
    onState(state);
    if (grew) onSave(state.segments);
  };

  return {
    state: () => state,

    listen(): () => void {
      const rec = new Recognizer();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true; // live words (low latency)
      let active = true;
      rec.onresult = (e) => {
        if (!active) return;
        set(onResults(state, Array.from(e.results, (x) => ({ transcript: x[0].transcript, isFinal: x.isFinal }))));
      };
      rec.onend = () => {
        if (!active) return;
        set(onSessionEnd(state));
        // Browsers end a session after a silence; keep listening.
        try { rec.start(); } catch { /* already started or mic blocked */ }
      };
      rec.onerror = () => undefined;
      try { rec.start(); } catch { /* mic blocked */ }
      return () => {
        // Pause or Stop: keep unfinished words, stop listening, ignore late events from this session.
        if (!active) return;
        active = false;
        set(onSessionEnd(state));
        rec.stop();
      };
    },

    take(): string[] {
      const sentences = toSentences(onSessionEnd(state).segments);
      set({ ...LIVE_START, segments: [] });
      return sentences;
    },
  };
}
