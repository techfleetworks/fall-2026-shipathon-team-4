/**
 * Where encrypted records live (ADR-018). Stores and returns ENVELOPES only: encryption happens in
 * server/records/service.ts, so neither implementation ever sees a readable record.
 *  - Supabase (production): public.visit_records (supabase/migrations/20261115000000_visit_records.sql), via the server key.
 *  - Memory (tests, local dev without Supabase): same behavior, gone when the server restarts.
 *
 * Versions make saves safe from two devices: `put(user, envelope, baseVersion)` only succeeds when the stored version
 * is still `baseVersion` (0 = "there is no record yet"); otherwise it reports a conflict and changes nothing.
 */
import { createClient } from '@supabase/supabase-js';
import type { Envelope } from './crypto.js';

export interface StoredEnvelope { envelope: Envelope; version: number; updatedAt: string }
export type PutResult = { ok: true; version: number; updatedAt: string } | { ok: false; conflict: true };

export interface RecordStore {
  get(userId: string): Promise<StoredEnvelope | null>;
  put(userId: string, envelope: Envelope, baseVersion: number): Promise<PutResult>;
  /** true if a record was deleted. */
  delete(userId: string): Promise<boolean>;
}

// ---------------------------------------------------------------- memory

export function memoryRecordStore(): RecordStore & { rows: Map<string, StoredEnvelope> } {
  const rows = new Map<string, StoredEnvelope>();
  return {
    rows,
    async get(userId) {
      const r = rows.get(userId);
      return r ? structuredClone(r) : null;
    },
    async put(userId, envelope, baseVersion) {
      const current = rows.get(userId)?.version ?? 0;
      if (current !== baseVersion) return { ok: false, conflict: true };
      const row = { envelope: structuredClone(envelope), version: current + 1, updatedAt: new Date().toISOString() };
      rows.set(userId, row);
      return { ok: true, version: row.version, updatedAt: row.updatedAt };
    },
    async delete(userId) {
      return rows.delete(userId);
    },
  };
}

// ---------------------------------------------------------------- Supabase

const UNIQUE_VIOLATION = '23505';

export function supabaseRecordStore(url: string, serviceKey: string): RecordStore {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async get(userId) {
      const { data, error } = await db.from('visit_records').select('envelope, version, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('visit_records read failed');
      return data ? { envelope: data.envelope as Envelope, version: data.version as number, updatedAt: data.updated_at as string } : null;
    },
    async put(userId, envelope, baseVersion) {
      if (baseVersion === 0) {
        const { data, error } = await db.from('visit_records').insert({ user_id: userId, envelope, version: 1 }).select('version, updated_at').single();
        if (error?.code === UNIQUE_VIOLATION) return { ok: false, conflict: true };
        if (error || !data) throw new Error('visit_records insert failed');
        return { ok: true, version: data.version as number, updatedAt: data.updated_at as string };
      }
      // Compare-and-set: only updates when the stored version is still baseVersion.
      const { data, error } = await db
        .from('visit_records')
        .update({ envelope, version: baseVersion + 1 })
        .eq('user_id', userId)
        .eq('version', baseVersion)
        .select('version, updated_at');
      if (error) throw new Error('visit_records update failed');
      if (!data.length) return { ok: false, conflict: true };
      return { ok: true, version: data[0].version as number, updatedAt: data[0].updated_at as string };
    },
    async delete(userId) {
      const { data, error } = await db.from('visit_records').delete().eq('user_id', userId).select('user_id');
      if (error) throw new Error('visit_records delete failed');
      return data.length > 0;
    },
  };
}

export function recordStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RecordStore | undefined {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? supabaseRecordStore(url, key) : undefined;
}
