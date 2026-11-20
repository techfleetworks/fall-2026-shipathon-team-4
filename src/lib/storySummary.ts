/**
 * "See it in doctor terms" for Name how I feel: the server first (POST /api/prep-summary), with the app's built-in
 * engine as the fallback. The built-in engine is the same rules engine and runs the same guardrails, crisis check included.
 * First written by Diana as a stopgap for user testing; made permanent in ADR-024.
 *
 * A missing or expired sign-in never blocks someone from continuing their story: /api/prep-summary saves nothing,
 * and the same engine runs here. So the built-in engine is used when:
 *  - the server can't be reached, or
 *  - the server wants a sign-in (401): an account without a server sign-in (demo visitors exploring Theo's data, an
 *    on-device account), or a real sign-in that has expired.
 * In the expired case the answer carries `signInExpired`, so the screen can say "log in again" without blocking.
 */
import { requestPrepSummary, type PrepSummaryOutcome } from './api';
import { translateStoryGuarded } from './engine';
import { supabase } from './supabaseClient';
import type { StoryDraft } from './types';

export type StorySummaryOutcome = PrepSummaryOutcome & { signInExpired?: true };

/** Shown (not blocking) when a real sign-in expired and the story was turned into doctor terms on this device. */
export const SIGN_IN_EXPIRED_NOTE = 'Your sign-in has expired, so this was done on this device. Log in again to keep your record backed up.';

/** True when there's a server sign-in (a Supabase session) on this device. */
export async function hasServerSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    return !!(await supabase.auth.getSession()).data.session;
  } catch {
    return false;
  }
}

function onDevice(draft: StoryDraft): PrepSummaryOutcome {
  const out = translateStoryGuarded(draft);
  return out.status === 'blocked' ? { status: 'blocked', message: out.message } : out;
}

export async function requestStorySummary(
  draft: StoryDraft,
  {
    signal,
    fetchImpl,
    hasSession = hasServerSession,
  }: { signal?: AbortSignal; fetchImpl?: typeof fetch; hasSession?: () => Promise<boolean> } = {},
): Promise<StorySummaryOutcome> {
  const out = await requestPrepSummary(draft, { signal, fetchImpl });
  if (out.status === 'unavailable') return onDevice(draft);
  if (out.status === 'rejected' && out.error.code === 'UNAUTHORIZED') {
    const local = onDevice(draft);
    // Had a real sign-in that no longer works: still continue, but say so.
    return (await hasSession()) && local.status === 'ok' ? { ...local, signInExpired: true } : local;
  }
  return out;
}
