/**
 * Where the public demo record comes from (ADR-010): the one app_state row marked is_public_demo
 * (Supabase), or an in-memory record (tests, local dev without Supabase).
 */
import { createClient } from '@supabase/supabase-js';

export interface DemoRecord {
  data: unknown;
  /** YYYY-MM-DD the data was written. */
  anchorDate: string;
}

export interface DemoSource {
  /** The public demo record, or null if none is set up. Throws on a database error. */
  get(): Promise<DemoRecord | null>;
  /** This user's own record (used when Theo logs in), or null. Throws on a database error. */
  getForUser(userId: string): Promise<DemoRecord | null>;
}

export function memoryDemoSource(record: DemoRecord | null, owners: Record<string, DemoRecord> = {}): DemoSource {
  return { get: async () => record, getForUser: async (id) => owners[id] ?? null };
}

export function supabaseDemoSource(url: string, serviceKey: string): DemoSource {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async get() {
      const { data, error } = await db.from('app_state').select('data, anchor_date').eq('is_public_demo', true).maybeSingle();
      if (error) throw new Error('app_state demo lookup failed');
      if (!data) return null;
      return { data: data.data as unknown, anchorDate: String(data.anchor_date) };
    },
    async getForUser(userId) {
      const { data, error } = await db.from('app_state').select('data, anchor_date').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('app_state lookup failed');
      if (!data) return null;
      return { data: data.data as unknown, anchorDate: String(data.anchor_date) };
    },
  };
}

export function demoSourceFromEnv(env: NodeJS.ProcessEnv = process.env): DemoSource | undefined {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? supabaseDemoSource(url, key) : undefined;
}
