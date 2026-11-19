/**
 * "See it in doctor terms" for Name how I feel: the server first (POST /api/prep-summary), with the app's
 * built-in engine as the fallback. The built-in engine runs the same guardrails, crisis check included.
 *
 * Falls back when:
 *  - the server can't be reached, or
 *  - the server wants a sign-in (401) and this person has no server sign-in at all, e.g. an account kept
 *    on this device only (first-name sign-up). Without the fallback they could never save their story.
 *
 * Someone who IS signed in to the server but whose sign-in expired still gets the "please log in again"
 * message, so they can fix it.
 */
import { requestPrepSummary, type PrepSummaryOutcome } from './api';
import { translateStoryGuarded } from './engine';
import { supabase } from './supabaseClient';
import type { StoryDraft } from './types';

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
): Promise<PrepSummaryOutcome> {
  const out = await requestPrepSummary(draft, { signal, fetchImpl });
  if (out.status === 'unavailable') return onDevice(draft);
  if (out.status === 'rejected' && out.error.code === 'UNAUTHORIZED' && !(await hasSession())) return onDevice(draft);
  return out;
}
