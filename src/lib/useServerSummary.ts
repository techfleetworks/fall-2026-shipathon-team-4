/**
 * Live "Your doctor reads" preview, computed by the backend server (POST /api/prep-summary), where the
 * engine and the guardrails run. Used by the story screen (Before.tsx).
 *
 * - Waits ~half a second after the patient stops typing, then asks the server (one request at a time;
 *   a newer keystroke cancels the older request).
 * - Crisis language is checked here on the device first, and then nothing is sent (crisis text never
 *   leaves the device). The screen decides what to show.
 * - Waits until the saved draft has finished loading, so a half-loaded draft is never sent.
 */
import { useEffect, useState } from 'react';
import { requestPrepSummary } from './api';
import { storyDraftHasCrisis } from './guardrails/enforce';
import { useDraft } from './store';
import type { FieldKey, StoryDraft, SummaryField } from './types';

export type ServerSummaryStatus = 'waiting' | 'loading' | 'ok' | 'blocked' | 'crisis' | 'unavailable';

export interface ServerSummary {
  status: ServerSummaryStatus;
  /** The engine's lines from the server (before the patient's own rewrites are applied). */
  fields: SummaryField[];
  /** For 'blocked' and 'unavailable': a message safe to show. */
  message?: string;
}

/** Shown before the first answer arrives, so the panel keeps its shape. */
export const PLACEHOLDER_FIELDS: SummaryField[] = (
  [
    ['symptoms', 'Symptoms'],
    ['onset', 'Onset'],
    ['frequency', 'Frequency'],
    ['severity', 'Severity'],
    ['triggers', 'Triggers'],
    ['tried', 'Tried'],
  ] as [FieldKey, string][]
).map(([key, label]) => ({ key, label, clinical: 'Not discussed' }));

/** Put the patient's own rewrites on top of the server's lines. The patient's wording always wins. */
export function applyOverrides(fields: SummaryField[], overrides: StoryDraft['overrides']): SummaryField[] {
  return fields.map((f) => {
    const o = overrides?.[f.key];
    return o !== undefined ? { ...f, clinical: o || 'Not discussed', editedByPatient: true } : f;
  });
}

/** True when the patient hasn't typed or picked anything yet (no need to ask the server). */
export function isEmptyStory(d: StoryDraft): boolean {
  const texts = [d.opening, d.onset.text, d.frequency.text, d.severity.text, d.triggers.text, d.tried.text, d.tried.outcome, d.tried.medName, d.tried.medDose, d.tried.medDuration];
  return (
    texts.every((t) => !t.trim()) &&
    !d.onset.choice && !d.onset.afterMedChange && !d.frequency.choice && d.severity.score === undefined &&
    !d.severity.impacts.length && !d.triggers.choices.length && !d.tried.choices.length
  );
}

function useDraftHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useDraft.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useDraft.persist.onFinishHydration(() => setHydrated(true));
    if (useDraft.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);
  return hydrated;
}

export function useServerSummary(draft: StoryDraft, delayMs = 500): ServerSummary {
  const hydrated = useDraftHydrated();
  const [state, setState] = useState<ServerSummary>({ status: 'waiting', fields: PLACEHOLDER_FIELDS });
  // Only the parts the engine reads; editing a line (overrides) doesn't need a new server call.
  const { overrides: _ignored, ...engineInput } = draft;
  const key = JSON.stringify(engineInput);

  useEffect(() => {
    if (!hydrated) return;
    if (storyDraftHasCrisis(draft)) {
      setState((s) => ({ ...s, status: 'crisis' }));
      return;
    }
    if (isEmptyStory(draft)) {
      setState({ status: 'ok', fields: PLACEHOLDER_FIELDS });
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, status: 'loading' }));
      requestPrepSummary(engineInput as StoryDraft, { signal: ctrl.signal }).then((out) => {
        if (ctrl.signal.aborted) return;
        if (out.status === 'ok') setState({ status: 'ok', fields: out.fields });
        else if (out.status === 'crisis') setState((s) => ({ ...s, status: 'crisis' }));
        else if (out.status === 'blocked') setState({ status: 'blocked', fields: PLACEHOLDER_FIELDS, message: out.message });
        // An empty story is fine while typing: keep the placeholders.
        else if (out.status === 'rejected' && out.error.code === 'EMPTY_STORY') setState({ status: 'ok', fields: PLACEHOLDER_FIELDS });
        else setState((s) => ({ ...s, status: 'unavailable', message: out.status === 'rejected' ? out.error.message : out.message }));
      });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `key` captures every engine input; `draft` itself changes identity on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hydrated, delayMs]);

  return state;
}
