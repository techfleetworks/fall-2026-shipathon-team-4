/**
 * Secure storage (ADR-018): encrypts a person's record before it is stored, so the database alone can't read it.
 *
 *  - AES-256-GCM (authenticated: any change to the stored bytes makes decryption fail, never returns wrong data).
 *  - A new random 96-bit IV for every write.
 *  - The ciphertext is bound to its owner: the user's id is the "additional authenticated data", so a row copied onto
 *    another user's id fails to decrypt.
 *  - The key lives only in the server's settings (RECORD_ENCRYPTION_KEY, 32 random bytes in base64), never in the
 *    database or the browser. RECORD_ENCRYPTION_KEY_PREVIOUS lets an old key still decrypt during a key change; the
 *    next save re-encrypts with the current key. Each envelope names its key by `kid` (a short hash, not the key).
 *  - Fails closed: a missing or malformed key means records are not stored at all (the API answers 503).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface Envelope {
  v: 1;
  alg: 'A256GCM';
  /** Which key encrypted it (first 16 hex characters of the key's SHA-256). */
  kid: string;
  iv: string; // base64
  ct: string; // base64
  tag: string; // base64
}

export interface RecordKey { kid: string; key: Buffer }
export interface RecordKeys { current: RecordKey; previous?: RecordKey }

export class DecryptError extends Error {
  constructor(reason: 'unknown-key' | 'malformed' | 'auth-failed') {
    super(reason);
    this.name = 'DecryptError';
  }
}

const aad = (userId: string) => Buffer.from(`visit_records:v1:${userId}`, 'utf8');

/** A key from its base64 setting. undefined if missing or not exactly 32 bytes. */
export function parseKey(b64: string | undefined): RecordKey | undefined {
  const s = b64?.trim();
  if (!s || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return undefined;
  const key = Buffer.from(s, 'base64');
  if (key.length !== 32) return undefined;
  return { kid: createHash('sha256').update(key).digest('hex').slice(0, 16), key };
}

/** Keys from the environment. undefined (not configured) unless RECORD_ENCRYPTION_KEY is a valid 32-byte key. */
export function recordKeysFromEnv(env: NodeJS.ProcessEnv = process.env): RecordKeys | undefined {
  const current = parseKey(env.RECORD_ENCRYPTION_KEY);
  if (!current) return undefined;
  const previous = parseKey(env.RECORD_ENCRYPTION_KEY_PREVIOUS);
  return previous && previous.kid !== current.kid ? { current, previous } : { current };
}

export function encryptRecord(record: unknown, userId: string, keys: RecordKeys): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys.current.key, iv);
  cipher.setAAD(aad(userId));
  const ct = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
  return { v: 1, alg: 'A256GCM', kid: keys.current.kid, iv: iv.toString('base64'), ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptRecord(envelope: unknown, userId: string, keys: RecordKeys): unknown {
  const e = envelope as Partial<Envelope> | null;
  if (!e || e.v !== 1 || e.alg !== 'A256GCM' || typeof e.kid !== 'string' || typeof e.iv !== 'string' || typeof e.ct !== 'string' || typeof e.tag !== 'string') {
    throw new DecryptError('malformed');
  }
  const k = [keys.current, keys.previous].find((x) => x?.kid === e.kid);
  if (!k) throw new DecryptError('unknown-key');
  const iv = Buffer.from(e.iv, 'base64');
  const tag = Buffer.from(e.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new DecryptError('malformed');
  try {
    const decipher = createDecipheriv('aes-256-gcm', k.key, iv);
    decipher.setAAD(aad(userId));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(e.ct, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch {
    throw new DecryptError('auth-failed');
  }
}

/** True when the envelope was written with an older key (re-save it to move it to the current key). */
export const needsReencrypt = (envelope: Envelope, keys: RecordKeys) => envelope.kid !== keys.current.kid;
