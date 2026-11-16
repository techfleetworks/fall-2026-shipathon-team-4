import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DecryptError, decryptRecord, encryptRecord, needsReencrypt, parseKey, recordKeysFromEnv, type RecordKeys } from './crypto.js';

const b64 = () => randomBytes(32).toString('base64');
const keysOf = (current: string, previous?: string): RecordKeys => recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: current, RECORD_ENCRYPTION_KEY_PREVIOUS: previous })!;
const RECORD = { profile: { name: 'Sam' }, evidence: [{ id: 'e1', date: '2026-11-01', type: 'symptom', title: 'Symptom', detail: 'Dizzy when I stand up' }] };

describe('record encryption (AES-256-GCM)', () => {
  it('round-trips a record for its owner', () => {
    const keys = keysOf(b64());
    expect(decryptRecord(encryptRecord(RECORD, 'alice', keys), 'alice', keys)).toEqual(RECORD);
  });

  it('stores nothing readable: no health words appear in the envelope', () => {
    const env = encryptRecord(RECORD, 'alice', keysOf(b64()));
    expect(JSON.stringify(env)).not.toMatch(/Dizzy|Sam|symptom/i);
    expect(env).toMatchObject({ v: 1, alg: 'A256GCM' });
  });

  it('uses a new IV every time (the same record encrypts differently)', () => {
    const keys = keysOf(b64());
    const a = encryptRecord(RECORD, 'alice', keys);
    const b = encryptRecord(RECORD, 'alice', keys);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("is bound to its owner: Alice's row can't be read as Bob's", () => {
    const keys = keysOf(b64());
    expect(() => decryptRecord(encryptRecord(RECORD, 'alice', keys), 'bob', keys)).toThrow(DecryptError);
  });

  it('any change to the stored bytes fails decryption (never returns altered data)', () => {
    const keys = keysOf(b64());
    const env = encryptRecord(RECORD, 'alice', keys);
    const ct = Buffer.from(env.ct, 'base64');
    ct[0] ^= 1;
    expect(() => decryptRecord({ ...env, ct: ct.toString('base64') }, 'alice', keys)).toThrow('auth-failed');
    const tag = Buffer.from(env.tag, 'base64');
    tag[0] ^= 1;
    expect(() => decryptRecord({ ...env, tag: tag.toString('base64') }, 'alice', keys)).toThrow('auth-failed');
  });

  it('a different key cannot read it', () => {
    const env = encryptRecord(RECORD, 'alice', keysOf(b64()));
    expect(() => decryptRecord(env, 'alice', keysOf(b64()))).toThrow('unknown-key');
  });

  it('key change: the previous key still decrypts, and the record is flagged to re-encrypt', () => {
    const oldKey = b64();
    const env = encryptRecord(RECORD, 'alice', keysOf(oldKey));
    const rotated = keysOf(b64(), oldKey);
    expect(decryptRecord(env, 'alice', rotated)).toEqual(RECORD);
    expect(needsReencrypt(env, rotated)).toBe(true);
    expect(needsReencrypt(encryptRecord(RECORD, 'alice', rotated), rotated)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['blank', '  '],
    ['too short (16 bytes)', randomBytes(16).toString('base64')],
    ['too long (64 bytes)', randomBytes(64).toString('base64')],
    ['not base64', 'not a key!'],
  ])('fails closed when the key is %s', (_n, value) => {
    expect(parseKey(value)).toBeUndefined();
    expect(recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: value })).toBeUndefined();
  });

  it('rejects malformed envelopes', () => {
    const keys = keysOf(b64());
    for (const bad of [null, {}, { v: 2 }, { ...encryptRecord(RECORD, 'alice', keys), iv: 'AAAA' }]) {
      expect(() => decryptRecord(bad, 'alice', keys)).toThrow(DecryptError);
    }
  });
});
