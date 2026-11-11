/**
 * Browser client for the app's API (server/app.ts). Same origin, so the path is relative:
 * on Vercel it reaches the serverless function, and in local dev Vite forwards it to `npm run dev:api`.
 */
import { APP_NAME } from './brand';
import { SYNTHETIC_LABEL } from './transcript/constants';
import { intakeError } from './transcript/intake';
import type { TranscriptPayload, TranscriptSource } from './transcript/types';
import type { StoryDraft, SummaryField } from './types';

export type ServerTranscriptOutcome =
  | { status: 'accepted'; payload: TranscriptPayload }
  /** Crisis language: the server built nothing. Show the crisis screen. */
  | { status: 'crisis' }
  /** The server refused the input. `message` is safe to show. */
  | { status: 'rejected'; error: { code: string; message: string } }
  /** The server couldn't be reached or answered unexpectedly. Nothing was processed. */
  | { status: 'unavailable'; message: string };

export const SERVER_UNAVAILABLE_MESSAGE = `We couldn’t reach the ${APP_NAME} server, so nothing was processed. Check your connection and try again.`;

const unavailable = (): ServerTranscriptOutcome => ({ status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE });

function isPayload(v: unknown): v is TranscriptPayload {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Partial<TranscriptPayload>;
  return typeof p.transcript === 'string' && Array.isArray(p.turns) && p.disclaimer === SYNTHETIC_LABEL;
}

// ---------------------------------------------------------------- POST /api/prep-summary

export type PrepSummaryOutcome =
  | { status: 'ok'; fields: SummaryField[] }
  /** Crisis language: nothing was built. Show the crisis screen. */
  | { status: 'crisis' }
  /** A guardrail was broken; show this message instead of a summary. */
  | { status: 'blocked'; message: string }
  | { status: 'rejected'; error: { code: string; message: string } }
  | { status: 'unavailable'; message: string };

function isFields(v: unknown): v is SummaryField[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((f) => typeof f === 'object' && f !== null && typeof f.key === 'string' && typeof f.label === 'string' && typeof f.clinical === 'string')
  );
}

/** Ask the server to turn a story into doctor terms (engine + guardrails run there). Never throws. */
export async function requestPrepSummary(
  draft: StoryDraft,
  { signal, fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<PrepSummaryOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/prep-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
      signal,
    });
  } catch {
    return unavailablePrep();
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return unavailablePrep();
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  if (res.status === 200 && b.status === 'ok' && isFields(b.fields)) return { status: 'ok', fields: b.fields };
  if (res.status === 200 && b.status === 'crisis') return { status: 'crisis' };
  if (res.status === 200 && b.status === 'blocked' && typeof b.message === 'string') return { status: 'blocked', message: b.message };
  if (res.status === 400 && typeof b.error === 'object' && b.error !== null) {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === 'string' && typeof e.message === 'string') return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return unavailablePrep();
}

const unavailablePrep = (): PrepSummaryOutcome => ({ status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE });

// ---------------------------------------------------------------- POST /api/transcripts

/** Send a transcript to POST /api/transcripts. Never throws. */
export async function submitTranscriptToServer(
  transcript: string,
  source: TranscriptSource,
  { signal, fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ServerTranscriptOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/transcripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, source }),
      signal,
    });
  } catch {
    return unavailable();
  }

  // The body limit (1 MB) can trip before the 200,000-character check; show the same message.
  if (res.status === 413) return { status: 'rejected', error: intakeError('TOO_LONG') };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return unavailable();
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  if (res.status === 201 && b.status === 'accepted' && isPayload(b.payload)) return { status: 'accepted', payload: b.payload };
  if (res.status === 200 && b.status === 'crisis') return { status: 'crisis' };
  if (res.status === 400 && typeof b.error === 'object' && b.error !== null) {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === 'string' && typeof e.message === 'string') return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return unavailable();
}
