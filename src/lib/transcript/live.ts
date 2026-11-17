/**
 * Live transcript handling (board card "Partial / low-latency transcript handling", ADR-021).
 *
 * The browser's speech recognition reports, for one listening session, a growing list of results. Each result is either
 * FINAL (it will never change) or INTERIM (a guess that keeps being revised as the person speaks). Browsers also end a
 * session after a silence; the app starts a new one, and the result list starts again from zero.
 *
 * This pure state machine turns those events into:
 *   - `segments`: finished pieces of speech, in order. Only these are saved (they never change).
 *   - `interim`:  the words being spoken right now, shown live (low latency) but never saved as-is.
 * Rules:
 *   - a final result is taken once, in order (`consumed` counts how many results of this session are taken);
 *   - when a session ends with words still interim, they are kept as a segment (the browser sometimes never finalizes
 *     the last words before a pause or Stop);
 *   - a segment that just repeats the previous one is dropped (some browsers report a phrase twice);
 *   - text is tidied (spaces collapsed) and capped, so one runaway result can't fill the device's storage.
 * No audio is involved here: only text the browser already produced.
 */

export interface SpeechResult { transcript: string; isFinal: boolean }

export interface LiveState {
  segments: string[];
  interim: string;
  /** How many results of the current listening session are already taken as final. */
  consumed: number;
}

export const LIVE_START: LiveState = { segments: [], interim: '', consumed: 0 };
export const MAX_SEGMENT_CHARS = 1000;
export const MAX_SEGMENTS = 2000;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_SEGMENT_CHARS);
const sameText = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, '') === b.toLowerCase().replace(/[^a-z0-9]+/g, '');

function add(segments: string[], text: string): string[] {
  const t = tidy(text);
  if (!t || segments.length >= MAX_SEGMENTS) return segments;
  const last = segments[segments.length - 1];
  if (last !== undefined && sameText(last, t)) return segments;
  return [...segments, t];
}

/** A new results event from the current listening session (the browser sends the whole list each time). */
export function onResults(s: LiveState, results: ArrayLike<SpeechResult>): LiveState {
  let { segments, consumed } = s;
  // Take finals in order. A final after an interim one waits until the earlier result is final too.
  while (consumed < results.length && results[consumed].isFinal) {
    segments = add(segments, results[consumed].transcript);
    consumed++;
  }
  let interim = '';
  for (let i = consumed; i < results.length; i++) interim += ` ${results[i].transcript}`;
  return { segments, interim: tidy(interim), consumed };
}

/** The listening session ended (silence, Pause or Stop): keep any unfinished words, and start counting again. */
export function onSessionEnd(s: LiveState): LiveState {
  return { segments: s.interim ? add(s.segments, s.interim) : s.segments, interim: '', consumed: 0 };
}

/** Segments as recap sentences: capitalized, ending with a period, very short fragments ("um", "ok") dropped. */
export function toSentences(segments: readonly string[]): string[] {
  return segments
    .flatMap((seg) => seg.split(/(?<=[.?!])\s+/))
    .map((x) => x.replace(/[.\s]+$/, '').trim())
    .filter((x) => x.length > 3)
    .map((x) => `${x.charAt(0).toUpperCase()}${x.slice(1)}${/[?!]$/.test(x) ? '' : '.'}`);
}
