/**
 * The encrypted record service (ADR-018): the only place records are encrypted and decrypted.
 * The store underneath sees envelopes only. Configured only when BOTH a store and a valid key exist (fails closed).
 */
import { decryptRecord, encryptRecord, recordKeysFromEnv, type RecordKeys } from './crypto.js';
import type { SavedRecord } from './record.js';
import { recordStoreFromEnv, type RecordStore } from './store.js';

export interface LoadedRecord { record: SavedRecord; version: number; updatedAt: string }
export type SaveResult = { status: 'saved'; version: number; updatedAt: string } | { status: 'conflict'; current: LoadedRecord | null };

export interface RecordService {
  load(userId: string): Promise<LoadedRecord | null>;
  save(userId: string, record: SavedRecord, baseVersion: number): Promise<SaveResult>;
  remove(userId: string): Promise<boolean>;
}

export function encryptedRecordService(store: RecordStore, keys: RecordKeys): RecordService {
  const load = async (userId: string): Promise<LoadedRecord | null> => {
    const row = await store.get(userId);
    if (!row) return null;
    // A record that can't be decrypted (wrong key, tampered) throws: the route answers 500, never returns garbage.
    return { record: decryptRecord(row.envelope, userId, keys) as SavedRecord, version: row.version, updatedAt: row.updatedAt };
  };
  return {
    load,
    async save(userId, record, baseVersion) {
      const out = await store.put(userId, encryptRecord(record, userId, keys), baseVersion);
      if (out.ok) return { status: 'saved', version: out.version, updatedAt: out.updatedAt };
      return { status: 'conflict', current: await load(userId) };
    },
    remove: (userId) => store.delete(userId),
  };
}

export function recordServiceFromEnv(env: NodeJS.ProcessEnv = process.env): RecordService | undefined {
  const store = recordStoreFromEnv(env);
  const keys = recordKeysFromEnv(env);
  return store && keys ? encryptedRecordService(store, keys) : undefined;
}
