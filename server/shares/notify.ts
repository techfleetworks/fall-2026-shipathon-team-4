/**
 * Instant "stopped" signal to open doctor pages (ADR-009). When a patient stops sharing (one person,
 * everyone, or by deleting the account), the server broadcasts on each link's Realtime channel and the
 * open page re-checks at once, instead of waiting for its 30-second backup check.
 *
 * Channel: `share:<sha256(token)>`. Only someone holding the link can work that out (the page hashes its
 * own token; the server only ever had the hash). The message carries NO data, and the page treats it as a
 * hint: it asks the server before clearing, so a forged message can't hide a working link.
 *
 * Best effort: a failed broadcast never fails the stop (the page's backup check still catches it).
 * Sent over HTTP (Supabase Realtime REST), so the serverless function needs no open connection.
 */
import { createClient } from '@supabase/supabase-js';

export const shareChannel = (tokenHash: string) => `share:${tokenHash}`;
export const STOPPED_EVENT = 'stopped';

export interface ShareNotifier {
  stopped(tokenHashes: readonly string[]): Promise<void>;
}

export const noopNotifier: ShareNotifier = { stopped: async () => {} };

/** For tests: remembers what would have been sent. */
export function recordingNotifier(): ShareNotifier & { sent: string[] } {
  const sent: string[] = [];
  return { sent, stopped: async (hashes) => { sent.push(...hashes.map(shareChannel)); } };
}

export function supabaseShareNotifier(url: string, serviceKey: string): ShareNotifier {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async stopped(tokenHashes) {
      await Promise.all(
        tokenHashes.map(async (hash) => {
          const channel = client.channel(shareChannel(hash));
          try {
            const r = await channel.httpSend(STOPPED_EVENT, {}, { timeout: 3000 });
            if (!r.success) console.warn(`[sharing] stop signal not sent (${r.status})`);
          } catch {
            console.warn('[sharing] stop signal not sent (network)');
          } finally {
            await client.removeChannel(channel);
          }
        }),
      );
    },
  };
}

export function shareNotifierFromEnv(env: NodeJS.ProcessEnv = process.env): ShareNotifier {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? supabaseShareNotifier(url, key) : noopNotifier;
}
