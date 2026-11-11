/**
 * Local-only password check (no server yet). We never store the password —
 * only a salted PBKDF2 hash, so "Log in" on this device can verify it.
 * NOTE: this guards the app screen, not the data: browser storage itself is
 * not encrypted. Real auth (Supabase, ADR-001) replaces this.
 */
export interface PasswordHash {
  salt: string;
  hash: string;
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256);
  return toB64(bits);
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toB64(salt), hash: await derive(password, salt) };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  return (await derive(password, fromB64(stored.salt))) === stored.hash;
}
