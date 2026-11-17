/**
 * React wrapper for the live capture controller (liveCapture.ts, ADR-021), for At the visit.
 * Saves each FINISHED piece to the visit right away (`visit.live`), so a closed tab, dead battery or refresh never loses
 * what was captured. Nothing is sent anywhere; no audio is kept.
 *
 *   interim     the words being spoken right now (show them, don't save them)
 *   count       finished pieces saved so far
 *   stop()      returns the recap sentences and clears the saved pieces (call when the person presses Stop)
 *   leftover()  same, for pieces left by a capture that never reached Stop (the page closed)
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { createLiveCapture, type RecognizerLike } from './liveCapture';

const saved = (visitId: string) => useApp.getState().visits.find((v) => v.id === visitId)?.live?.segments ?? [];
const persist = (visitId: string, segments: string[]) =>
  useApp.getState().updateVisit(visitId, { live: segments.length ? { segments, updatedAt: new Date().toISOString() } : undefined });

export function useLiveTranscript(visitId: string, Recognizer: (new () => RecognizerLike) | undefined, listening: boolean) {
  const [interim, setInterim] = useState('');
  const [count, setCount] = useState(() => saved(visitId).length);
  const ref = useRef<ReturnType<typeof createLiveCapture> | null>(null);
  ref.current ??= createLiveCapture({
    Recognizer: Recognizer ?? (class {} as unknown as new () => RecognizerLike),
    initial: saved(visitId),
    onState: (s) => {
      setInterim(s.interim);
      setCount(s.segments.length);
    },
    onSave: (segments) => persist(visitId, segments),
  });

  useEffect(() => {
    if (!listening || !Recognizer) return;
    return ref.current!.listen();
  }, [listening, Recognizer]);

  const take = () => ref.current!.take();
  return { interim, count, stop: take, leftover: take };
}
