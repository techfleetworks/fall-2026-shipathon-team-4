/**
 * Browser client for sharing the one-page brief with the care team (ADR-009). None of these throw.
 * Server: POST/GET/DELETE /api/shares (signed in) and GET /api/shared/:token (the doctor, no sign-in).
 */
import { SERVER_UNAVAILABLE_MESSAGE, SIGNED_OUT_MESSAGE, jsonHeaders } from './api';
import type { BriefSnapshot } from './types';

export const RECIPIENT_ROLES = ['Primary care', 'Therapist', 'Psychiatrist', 'Specialist', 'Other'] as const;
export type RecipientRole = (typeof RECIPIENT_ROLES)[number];

export interface Recipient {
  name: string;
  role: RecipientRole;
  email: string;
  /** Hospital or clinic. */
  clinic: string;
}

export interface ShareSummary {
  id: string;
  recipient: Recipient;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export type ShareStatus = 'active' | 'expired' | 'stopped';

/** For the "Shared with" list: one row per person. */
export function shareStatus(s: Pick<ShareSummary, 'expiresAt' | 'revokedAt'>, now = Date.now()): ShareStatus {
  if (s.revokedAt) return 'stopped';
  return new Date(s.expiresAt).getTime() > now ? 'active' : 'expired';
}

type Failure = { status: 'rejected'; error: { code: string; message: string } } | { status: 'unavailable'; message: string };

export type CreateShareOutcome =
  /** `url` is shown once: put it in the email (shareEmailDraft) or copy it. Only its hash is stored. */
  | { status: 'ok'; share: ShareSummary; url: string; trimmed: boolean }
  | { status: 'crisis' }
  | Failure;

export type ListSharesOutcome = { status: 'ok'; shares: ShareSummary[] } | Failure;
export type StopShareOutcome = { status: 'ok'; stopped: number } | Failure;
export type SharedBriefOutcome =
  | { status: 'ok'; brief: BriefSnapshot; sharedWith: { name: string; role: string }; expiresAt: string }
  | { status: 'missing' | 'expired' | 'stopped' }
  | { status: 'unavailable'; message: string };

const unavailable = { status: 'unavailable', message: SERVER_UNAVAILABLE_MESSAGE } as const;
const signedOut = { status: 'rejected', error: { code: 'UNAUTHORIZED', message: SIGNED_OUT_MESSAGE } } as const;

async function call(path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<{ res: Response; body: Record<string, unknown> } | null> {
  try {
    const res = await fetchImpl(path, init);
    if (res.status === 204) return { res, body: {} };
    const body: unknown = await res.json();
    return { res, body: typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {} };
  } catch {
    return null;
  }
}

function failure(res: Response, body: Record<string, unknown>): Failure {
  if (res.status === 401) return signedOut;
  const e = body.error as Record<string, unknown> | undefined;
  if (res.status >= 400 && res.status < 500 && e && typeof e.code === 'string' && typeof e.message === 'string') {
    return { status: 'rejected', error: { code: e.code, message: e.message } };
  }
  return unavailable;
}

const isSummary = (v: unknown): v is ShareSummary => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  const r = s.recipient as Record<string, unknown> | undefined;
  return typeof s.id === 'string' && typeof s.expiresAt === 'string' && !!r && typeof r.name === 'string' && typeof r.email === 'string';
};

export async function createShare(
  input: { brief: BriefSnapshot; recipient: Recipient; days: number },
  { fetchImpl = fetch, origin = (globalThis as { location?: { origin?: string } }).location?.origin ?? '' }: { fetchImpl?: typeof fetch; origin?: string } = {},
): Promise<CreateShareOutcome> {
  const r = await call('/api/shares', { method: 'POST', headers: await jsonHeaders(), body: JSON.stringify(input) }, fetchImpl);
  if (!r) return unavailable;
  const { res, body } = r;
  if (res.status === 201 && body.status === 'ok' && isSummary(body.share) && typeof body.path === 'string') {
    return { status: 'ok', share: body.share, url: `${origin}${body.path}`, trimmed: body.trimmed === true };
  }
  if (res.status === 200 && body.status === 'crisis') return { status: 'crisis' };
  return failure(res, body);
}

export async function listShares({ fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<ListSharesOutcome> {
  const r = await call('/api/shares', { method: 'GET', headers: await jsonHeaders() }, fetchImpl);
  if (!r) return unavailable;
  if (r.res.status === 200 && Array.isArray(r.body.shares) && r.body.shares.every(isSummary)) return { status: 'ok', shares: r.body.shares };
  return failure(r.res, r.body);
}

/** Stop sharing with one person. Everyone else keeps their link. */
export async function stopShare(id: string, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<StopShareOutcome> {
  const r = await call(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await jsonHeaders() }, fetchImpl);
  if (!r) return unavailable;
  if (r.res.status === 204) return { status: 'ok', stopped: 1 };
  return failure(r.res, r.body);
}

/** Stop sharing with everyone. */
export async function stopAllShares({ fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<StopShareOutcome> {
  const r = await call('/api/shares', { method: 'DELETE', headers: await jsonHeaders() }, fetchImpl);
  if (!r) return unavailable;
  if (r.res.status === 200 && typeof r.body.stopped === 'number') return { status: 'ok', stopped: r.body.stopped };
  return failure(r.res, r.body);
}

/** The doctor's view of a link. No sign-in. */
export async function fetchSharedBrief(token: string, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<SharedBriefOutcome> {
  const r = await call(`/api/shared/${encodeURIComponent(token)}`, { method: 'GET' }, fetchImpl);
  if (!r) return unavailable;
  const { res, body } = r;
  const code = (body.error as Record<string, unknown> | undefined)?.code;
  if (res.status === 200 && body.status === 'ok' && typeof body.brief === 'object' && body.brief !== null && typeof body.expiresAt === 'string') {
    return { status: 'ok', brief: body.brief as BriefSnapshot, sharedWith: body.sharedWith as { name: string; role: string }, expiresAt: body.expiresAt };
  }
  if (code === 'LINK_NOT_FOUND') return { status: 'missing' };
  if (code === 'LINK_EXPIRED') return { status: 'expired' };
  if (code === 'LINK_STOPPED') return { status: 'stopped' };
  return unavailable;
}
