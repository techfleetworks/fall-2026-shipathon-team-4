/**
 * Browser connection to the Supabase project (sign-up / log-in server, ADR-001).
 * Switched on only when both build-time variables are set (see .env.example and docs/SUPABASE_SETUP.md):
 *   VITE_SUPABASE_URL       e.g. https://abcd1234.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the project's public "anon" key (safe in the browser: Row-Level Security protects data)
 * Never put the service_role key in a VITE_ variable: those are visible to anyone using the app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
