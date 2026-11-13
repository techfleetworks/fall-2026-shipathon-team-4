/** SHA-256 of a link token as lowercase hex: the same value the server stores (server/shares/store.ts hashToken). */
export async function hashTokenInBrowser(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
