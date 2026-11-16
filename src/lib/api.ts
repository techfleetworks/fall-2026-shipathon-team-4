/**
 * Browser client for the app's API (server/app.ts). Same origin, so the path is relative:
 * on Vercel it reaches the serverless function, and in local dev Vite forwards it to `npm run dev:api`.
 */
import { APP_NAME } from './brand';
import { SYNTHETIC_LABEL } from './transcript/constants';
import { intakeError } from './transcript/intake';
import type { TranscriptPayload, TranscriptSource } from './transcript/types';
import type { StoryDraft, SummaryField } from './types';
import type { AfterVisitSummary } from './afterVisit/summary';
import type { Explanation } from './explain/explain';
import type { LabExplanation, LabRow } from './labs/labs';

export type ServerTranscriptOutcome =
  | { status: 'accepted'; payload: TranscriptPayload }
  /** Crisis language: the server built nothing. Show the crisis screen. */
  | { status: 'crisis' }
  /** The server refused the input. `message` is safe to show. */
  | { status: 'rejected'; error: { code: string; message: string } }
  /** The server couldn't be reached or answered unexpectedly. Nothing was processed. */
  | { status: 'unavailable'; message: string };

// ---------------------------------------------------------------- sign-in token

/**
 * Returns the signed-in user's access token, or null. Registered by src/lib/auth.ts when Supabase sign-in is
 * set up; until then every call goes without one (the server allows that only while sign-in isn't configured).
 * Kept as a plug-in so this file has no browser-only imports and can be tested on the server.
 */
let accessTokenProvider: () => Promise<string | null> = async () => null;
export function setAccessTokenProvider(provider: () => Promise<string | null>): void {
  accessTokenProvider = provider;
}
/** JSON headers plus the sign-in token, when there is one. */
export async function jsonHeaders(): Promise<Record<string, string>> {
  const token = await accessTokenProvider().catch(() => null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Shown when the server says the sign-in is missing or expired (401). */
export const SIGNED_OUT_MESSAGE = 'Your sign-in has expired. Please log in again.';

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
      headers: await jsonHeaders(),
      body: JSON.stringify({ draft }),
      signal,
    });
  } catch {
    return unavailablePrep();
  }
  if (res.status === 401) return { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } };
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

// ---------------------------------------------------------------- POST /api/explain

export type ExplainOutcome =
  /** One entry per term found, in reading order. Empty if nothing needed explaining. */
  | { status: 'ok'; explanations: Explanation[] }
  | { status: 'crisis' }
  | { status: 'blocked'; message: string }
  | { status: 'rejected'; error: { code: string; message: string } }
  | { status: 'unavailable'; message: string };

const isExplanation = (v: unknown): v is Explanation => {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return ['id', 'term', 'found', 'plain'].every((k) => typeof e[k] === 'string') && (e.kind === 'term' || e.kind === 'shorthand');
};

/** Clinical → plain on the server (a note, what the doctor said, or doctor-terms lines). Never throws. */
export async function requestExplanation(
  text: string,
  { signal, fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ExplainOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/explain', { method: 'POST', headers: await jsonHeaders(), body: JSON.stringify({ text }), signal });
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  if (res.status === 401) return { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (res.status === 200 && b.status === 'ok' && Array.isArray(b.explanations) && b.explanations.every(isExplanation)) {
    return { status: 'ok', explanations: b.explanations };
  }
  if (res.status === 200 && b.status === 'crisis') return { status: 'crisis' };
  if (res.status === 200 && b.status === 'blocked' && typeof b.message === 'string') return { status: 'blocked', message: b.message };
  if (res.status === 400 && typeof b.error === 'object' && b.error !== null) {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === 'string' && typeof e.message === 'string') return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
}

// ---------------------------------------------------------------- POST /api/explain-results

export type ResultsExplainOutcome =
  /** `labsNote` is the "ranges differ between labs" line: show it once near the lab results. */
  | { status: 'ok'; labs: LabExplanation[]; note: Explanation[]; labsNote: string }
  | { status: 'crisis' }
  | { status: 'blocked'; message: string }
  | { status: 'rejected'; error: { code: string; message: string } }
  | { status: 'unavailable'; message: string };

const POSITIONS = ['above', 'within', 'below', 'change', 'no-range', 'not-compared'];
const isLabExplanation = (v: unknown): v is LabExplanation => {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return typeof l.test === 'string' && typeof l.value === 'string' && typeof l.summary === 'string' && POSITIONS.includes(l.position as string);
};

/** Lab results and/or a clinical note → plain language, on the server. Never throws. */
export async function requestResultsExplanation(
  input: { labs?: LabRow[]; note?: string },
  { signal, fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ResultsExplainOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/explain-results', { method: 'POST', headers: await jsonHeaders(), body: JSON.stringify(input), signal });
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  if (res.status === 401) return { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (
    res.status === 200 && b.status === 'ok' && typeof b.labsNote === 'string' &&
    Array.isArray(b.labs) && b.labs.every(isLabExplanation) && Array.isArray(b.note) && b.note.every(isExplanation)
  ) {
    return { status: 'ok', labs: b.labs, note: b.note, labsNote: b.labsNote };
  }
  if (res.status === 200 && b.status === 'crisis') return { status: 'crisis' };
  if (res.status === 200 && b.status === 'blocked' && typeof b.message === 'string') return { status: 'blocked', message: b.message };
  if (res.status === 400 && typeof b.error === 'object' && b.error !== null) {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === 'string' && typeof e.message === 'string') return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
}

// ---------------------------------------------------------------- POST /api/notes-summary

export type NotesSummaryOutcome =
  | { status: 'ok'; summary: AfterVisitSummary }
  | { status: 'crisis' }
  | { status: 'blocked'; message: string }
  | { status: 'rejected'; error: { code: string; message: string } }
  | { status: 'unavailable'; message: string };

/** A real user's visit notes → plain-language after-visit summary, on the server. Never throws. */
export async function requestNotesSummary(
  notes: string,
  talkingPoints: readonly string[],
  { signal, fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<NotesSummaryOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/notes-summary', { method: 'POST', headers: await jsonHeaders(), body: JSON.stringify({ notes, talkingPoints: talkingPoints.slice(0, 3) }), signal });
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  if (res.status === 401) return { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const s = b.summary as Record<string, unknown> | undefined;
  const lists = ['youRaised', 'doctorSaid', 'plan', 'notCovered', 'promised', 'talkingPoints'];
  if (res.status === 200 && b.status === 'ok' && s && lists.every((k) => Array.isArray(s[k]))) return { status: 'ok', summary: s as unknown as AfterVisitSummary };
  if (res.status === 200 && b.status === 'crisis') return { status: 'crisis' };
  if (res.status === 200 && b.status === 'blocked' && typeof b.message === 'string') return { status: 'blocked', message: b.message };
  if (res.status === 400 && typeof b.error === 'object' && b.error !== null) {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === 'string' && typeof e.message === 'string') return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
}

// ---------------------------------------------------------------- POST /api/visit-summary

export type VisitSummaryOutcome =
  /** `doctorSaid` fills the Recap's "What the doctor said". Empty if the clinician's lines couldn't be found. */
  | { status: 'ok'; doctorSaid: string[]; clinicians: string[]; dialogueTurns: number }
  | { status: 'crisis' }
  | { status: 'rejected'; error: { code: string; message: string } }
  | { status: 'unavailable'; message: string };

/** Turn a transcript into recap lines on the server. Never throws. */
export async function requestVisitSummary(
  transcript: string,
  source: TranscriptSource,
  { patientName, signal, fetchImpl = fetch }: { patientName?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<VisitSummaryOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/visit-summary', {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ transcript, source, ...(patientName ? { patientName } : {}) }),
      signal,
    });
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  if (res.status === 413) return { status: 'rejected', error: intakeError('TOO_LONG') };
  if (res.status === 401) return { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
  }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (res.status === 200 && b.status === 'ok' && strings(b.doctorSaid) && strings(b.clinicians) && typeof b.dialogueTurns === 'number') {
    return { status: 'ok', doctorSaid: b.doctorSaid, clinicians: b.clinicians, dialogueTurns: b.dialogueTurns };
  }
  if (res.status === 200 && b.status === 'crisis') return { status: 'crisis' };
  if (res.status === 400 && typeof b.error === 'object' && b.error !== null) {
    const e = b.error as Record<string, unknown>;
    if (typeof e.code === 'string' && typeof e.message === 'string') return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE };
}

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
      headers: await jsonHeaders(),
      body: JSON.stringify({ transcript, source }),
      signal,
    });
  } catch {
    return unavailable();
  }

  // The body limit (1 MB) can trip before the 200,000-character check; show the same message.
  if (res.status === 413) return { status: 'rejected', error: intakeError('TOO_LONG') };

  if (res.status === 401) return { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } };
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
