/**
 * Calls to the encrypted record store (ADR-018): GET / PUT / DELETE /api/me/record. Never throw.
 * Each outcome says what happened in words the sync engine can act on.
 */
import { jsonHeaders } from '../api.js';
import type { SyncRecord } from './merge.js';

export const RECORD_TIMEOUT_MS = 15_000;

export interface ServerRecord { record: SyncRecord; version: number; updatedAt: string }

/** Shared failure outcomes. */
export type RecordFailure =
  | { status: 'signed-out' } // 401
  | { status: 'not-configured' } // 503: no key / database on the server
  | { status: 'read-only' } // 403: the demo account
  | { status: 'offline' } // network error or timeout
  | { status: 'error' }; // anything else (4xx/5xx)

export type GetOutcome = { status: 'ok'; current: ServerRecord } | { status: 'none' } | RecordFailure;
export type PutOutcome = { status: 'ok'; version: number; updatedAt: string } | { status: 'conflict'; current: ServerRecord | null } | RecordFailure;
export type DeleteOutcome = { status: 'ok' } | { status: 'none' } | RecordFailure;

interface Opts { fetchImpl?: typeof fetch; timeoutMs?: number }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asServerRecord = (v: unknown): ServerRecord | null =>
  isObj(v) && isObj(v.record) && typeof v.version === 'number' && typeof v.updatedAt === 'string' ? { record: v.record as SyncRecord, version: v.version, updatedAt: v.updatedAt } : null;

function failure(status: number): RecordFailure {
  if (status === 401) return { status: 'signed-out' };
  if (status === 503) return { status: 'not-configured' };
  if (status === 403) return { status: 'read-only' };
  return { status: 'error' };
}

async function call(method: 'GET' | 'PUT' | 'DELETE', body: unknown, { fetchImpl = fetch, timeoutMs = RECORD_TIMEOUT_MS }: Opts): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl('/api/me/record', { method, headers: await jsonHeaders(), signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getRecord(opts: Opts = {}): Promise<GetOutcome> {
  const res = await call('GET', undefined, opts);
  if (!res) return { status: 'offline' };
  if (res.status === 404) return { status: 'none' };
  if (res.status !== 200) return failure(res.status);
  const current = asServerRecord(await res.json().catch(() => null));
  return current ? { status: 'ok', current } : { status: 'error' };
}

export async function putRecord(record: SyncRecord, baseVersion: number, opts: Opts = {}): Promise<PutOutcome> {
  const res = await call('PUT', { record, baseVersion }, opts);
  if (!res) return { status: 'offline' };
  const body: unknown = await res.json().catch(() => null);
  if (res.status === 409) return { status: 'conflict', current: isObj(body) ? asServerRecord(body.current) : null };
  if (res.status !== 200) return failure(res.status);
  return isObj(body) && typeof body.version === 'number' && typeof body.updatedAt === 'string'
    ? { status: 'ok', version: body.version, updatedAt: body.updatedAt }
    : { status: 'error' };
}

export async function deleteRecord(opts: Opts = {}): Promise<DeleteOutcome> {
  const res = await call('DELETE', undefined, opts);
  if (!res) return { status: 'offline' };
  if (res.status === 204) return { status: 'ok' };
  if (res.status === 404) return { status: 'none' };
  return failure(res.status);
}
