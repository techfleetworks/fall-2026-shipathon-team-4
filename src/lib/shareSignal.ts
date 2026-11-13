/**
 * Listens for the instant "stopped" signal on an open doctor link (ADR-009, server/shares/notify.ts).
 * The channel is `share:<sha256(token)>`: the page works it out from its own link, so only someone holding
 * the link can listen. The signal carries no data and is only a hint: the page asks the server before
 * clearing, so a forged signal can't hide a working link.
 *
 * No Supabase in the browser (local demo) → no live signal; the 30-second backup check still runs.
 */
import { supabase } from './supabaseClient';
import { hashTokenInBrowser } from './tokenHash';

export const STOPPED_EVENT = 'stopped';
export const shareChannel = (tokenHash: string) => `share:${tokenHash}`;

/** Calls `onSignal` whenever the patient stops this link. Returns a function that stops listening. */
export function listenForStop(token: string, onSignal: () => void): () => void {
  const client = supabase;
  if (!client || !globalThis.crypto?.subtle) return () => {};
  let closed = false;
  let channel: ReturnType<typeof client.channel> | undefined;
  void hashTokenInBrowser(token).then((hash) => {
    if (closed) return;
    channel = client.channel(shareChannel(hash)).on('broadcast', { event: STOPPED_EVENT }, () => onSignal()).subscribe();
  });
  return () => {
    closed = true;
    if (channel) void client.removeChannel(channel);
  };
}
