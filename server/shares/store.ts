/**
 * Where shared briefs live (ADR-009). Two implementations of one interface:
 *  - Supabase (production): tables from supabase/migrations/20261112000000_shared_briefs.sql, via the server key.
 *    Every query is scoped to the signed-in user's id here, AND Row-Level Security limits reads to own rows.
 *  - Memory (tests, and local dev without Supabase): same behavior, gone when the server restarts.
 * Only the SHA-256 hash of a link token is ever stored.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { BriefSnapshot } from '../../src/lib/types.js';

export const RECIPIENT_ROLES = ['Primary care', 'Therapist', 'Psychiatrist', 'Specialist', 'Other'] as const;
export type RecipientRole = (typeof RECIPIENT_ROLES)[number];

export interface Recipient {
  name: string;
  role: RecipientRole;
  /** Work email, lowercased. */
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

export interface SharedBriefRecord {
  brief: BriefSnapshot;
  recipient: Pick<Recipient, 'name' | 'role'>;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface ShareStore {
  create(userId: string, recipient: Recipient, brief: BriefSnapshot, tokenHash: string, expiresAt: Date): Promise<ShareSummary>;
  list(userId: string): Promise<ShareSummary[]>;
  /** Stops one link. False if it isn't this user's (or doesn't exist). */
  revoke(userId: string, id: string): Promise<boolean>;
  /** Stops every active link of this user. Returns how many were stopped. */
  revokeAll(userId: string): Promise<number>;
  findByTokenHash(tokenHash: string): Promise<SharedBriefRecord | null>;
}

/** A new link token: 256 random bits, URL-safe (43 characters). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------- memory

export function memoryShareStore(): ShareStore & { deleteUser(userId: string): void } {
  type Row = ShareSummary & { userId: string; tokenHash: string; brief: BriefSnapshot };
  const rows: Row[] = [];
  const summary = ({ id, recipient, createdAt, expiresAt, revokedAt }: Row): ShareSummary => ({
    id, recipient, createdAt, expiresAt, ...(revokedAt ? { revokedAt } : {}),
  });
  return {
    async create(userId, recipient, brief, tokenHash, expiresAt) {
      const row: Row = { id: randomBytes(16).toString('hex'), userId, recipient, brief, tokenHash, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
      rows.push(row);
      return summary(row);
    },
    async list(userId) {
      return rows.filter((r) => r.userId === userId).map(summary).reverse();
    },
    async revoke(userId, id) {
      const row = rows.find((r) => r.id === id && r.userId === userId);
      if (!row) return false;
      row.revokedAt ??= new Date().toISOString();
      return true;
    },
    async revokeAll(userId) {
      let n = 0;
      for (const r of rows) if (r.userId === userId && !r.revokedAt) { r.revokedAt = new Date().toISOString(); n++; }
      return n;
    },
    async findByTokenHash(tokenHash) {
      const r = rows.find((x) => x.tokenHash === tokenHash);
      if (!r) return null;
      return { brief: r.brief, recipient: { name: r.recipient.name, role: r.recipient.role }, createdAt: r.createdAt, expiresAt: r.expiresAt, ...(r.revokedAt ? { revokedAt: r.revokedAt } : {}) };
    },
    /** Mirrors ON DELETE CASCADE from auth.users. */
    deleteUser(userId) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === userId) rows.splice(i, 1);
    },
  };
}

// ---------------------------------------------------------------- Supabase

interface ShareRow {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  care_team: { name: string; role: RecipientRole; email: string; clinic: string } | null;
}

export function supabaseShareStore(url: string, serviceKey: string): ShareStore {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const toSummary = (r: ShareRow): ShareSummary => ({
    id: r.id,
    recipient: r.care_team ?? { name: '', role: 'Other', email: '', clinic: '' },
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    ...(r.revoked_at ? { revokedAt: r.revoked_at } : {}),
  });
  const COLUMNS = 'id, created_at, expires_at, revoked_at, care_team(name, role, email, clinic)';

  return {
    async create(userId, recipient, brief, tokenHash, expiresAt) {
      const person = await db
        .from('care_team')
        .upsert({ user_id: userId, ...recipient }, { onConflict: 'user_id,email' })
        .select('id')
        .single();
      if (person.error || !person.data) throw new Error('care_team upsert failed');
      const share = await db
        .from('shared_briefs')
        .insert({ user_id: userId, recipient_id: person.data.id, token_hash: tokenHash, brief, expires_at: expiresAt.toISOString() })
        .select(COLUMNS)
        .single();
      if (share.error || !share.data) throw new Error('shared_briefs insert failed');
      return toSummary(share.data as unknown as ShareRow);
    },
    async list(userId) {
      const { data, error } = await db.from('shared_briefs').select(COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
      if (error) throw new Error('shared_briefs list failed');
      return (data as unknown as ShareRow[]).map(toSummary);
    },
    async revoke(userId, id) {
      const { data, error } = await db
        .from('shared_briefs')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', id)
        .is('revoked_at', null)
        .select('id');
      if (error) throw new Error('shared_briefs revoke failed');
      if (data.length) return true;
      // Already stopped still counts as stopped; someone else's (or no) link does not.
      const existing = await db.from('shared_briefs').select('id').eq('user_id', userId).eq('id', id).maybeSingle();
      return !!existing.data;
    },
    async revokeAll(userId) {
      const { data, error } = await db.from('shared_briefs').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null).select('id');
      if (error) throw new Error('shared_briefs revoke-all failed');
      return data.length;
    },
    async findByTokenHash(tokenHash) {
      const { data, error } = await db
        .from('shared_briefs')
        .select('brief, created_at, expires_at, revoked_at, care_team(name, role)')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error || !data) return null;
      const r = data as unknown as { brief: BriefSnapshot; created_at: string; expires_at: string; revoked_at: string | null; care_team: { name: string; role: RecipientRole } | null };
      return {
        brief: r.brief,
        recipient: r.care_team ?? { name: '', role: 'Other' },
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        ...(r.revoked_at ? { revokedAt: r.revoked_at } : {}),
      };
    },
  };
}

export function shareStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ShareStore | undefined {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? supabaseShareStore(url, key) : undefined;
}
