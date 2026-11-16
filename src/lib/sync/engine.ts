/**
 * Visit store sync (ADR-019). Offline-first: the device copy is always the one the screens use; the encrypted server
 * copy (ADR-018) is a backup that also carries changes between the person's devices.
 *
 * Opt-in: nothing is sent until the person turns on "Back up and sync" (or restores a backup they made on another
 * device). The switch belongs to ONE account: if someone else signs in on this device, nothing syncs.
 *
 * One sync:
 *   1. (pull) read the server copy; otherwise assume it is still what this device last synced
 *   2. merge it with this device's copy (three-way, merge.ts) and put the result on the device
 *   3. save the result to the server with the version it was based on
 *   4. if another device saved first (409): merge again with that copy and retry (up to 3 times)
 * Offline, signed out, or the server not set up: the device copy is untouched and the status says why.
 * Syncs never overlap: a request during a sync runs once more after it.
 *
 * Everything outside (the account, the device record, storage, the server) is passed in, so this runs in tests too.
 */
import { mergeRecords, same, syncedPart, type SyncRecord } from './merge.js';
import type { DeleteOutcome, GetOutcome, PutOutcome } from './recordApi.js';

export type SyncStatus =
  | 'off'
  | 'syncing'
  | 'synced'
  | 'offline' // no connection: changes stay on this device until it's back
  | 'signed-out' // sign-in expired
  | 'other-account' // switched on by a different account on this device
  | 'not-configured' // the server isn't set up for backup yet
  | 'error';

/** What this device remembers between syncs (kept in its own storage key). */
export interface SyncMeta {
  enabled: boolean;
  /** The account that turned sync on. */
  userId: string | null;
  /** The record as of the last successful sync (the merge's base). */
  base: SyncRecord | null;
  version: number;
  lastSyncedAt: string | null;
}

export const OFF: SyncMeta = { enabled: false, userId: null, base: null, version: 0, lastSyncedAt: null };
export const MAX_ATTEMPTS = 3;

export interface SyncDeps {
  currentUserId(): Promise<string | null>;
  /** This device's record (the app store's data). */
  readLocal(): Record<string, unknown>;
  /** Puts the merged synced fields onto the device (keeping local-only fields). */
  applyLocal(merged: SyncRecord): void;
  loadMeta(): SyncMeta;
  saveMeta(meta: SyncMeta): void;
  api: {
    get(): Promise<GetOutcome>;
    put(record: SyncRecord, baseVersion: number): Promise<PutOutcome>;
    delete(): Promise<DeleteOutcome>;
  };
  onStatus?(status: SyncStatus, meta: SyncMeta): void;
  now?(): string;
}

export interface SyncEngine {
  /** Sync now. `pull` reads the server first (on start, coming online, returning to the app). */
  sync(opts?: { pull?: boolean }): Promise<SyncStatus>;
  /** Turn on for the signed-in account and sync right away. */
  enable(): Promise<SyncStatus>;
  /** Turn off. `deleteServerCopy` also deletes the encrypted copy on the server. */
  disable(opts?: { deleteServerCopy?: boolean }): Promise<{ deleted: boolean | 'failed' }>;
  /**
   * After logging in on a device without this account's data: if the account has a backup, put it on this device and
   * turn sync on (the person opted in on another device). Returns true if a backup was restored.
   */
  restoreAfterLogin(): Promise<boolean>;
  status(): SyncStatus;
}

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  const now = deps.now ?? (() => new Date().toISOString());
  let status: SyncStatus = deps.loadMeta().enabled ? 'synced' : 'off';
  let running: Promise<SyncStatus> | null = null;
  let again: { pull: boolean } | null = null;

  const setStatus = (s: SyncStatus) => {
    status = s;
    deps.onStatus?.(s, deps.loadMeta());
    return s;
  };

  const failed = (s: string): SyncStatus =>
    s === 'offline' || s === 'signed-out' || s === 'not-configured' ? (s as SyncStatus) : s === 'read-only' ? 'off' : 'error';

  async function runOnce(pull: boolean): Promise<SyncStatus> {
    const meta = deps.loadMeta();
    if (!meta.enabled) return setStatus('off');
    const uid = await deps.currentUserId();
    if (!uid) return setStatus('signed-out');
    if (uid !== meta.userId) return setStatus('other-account');
    setStatus('syncing');

    let remote: SyncRecord | null = meta.base;
    let remoteVersion = meta.version;
    if (pull || meta.version === 0) {
      const got = await deps.api.get();
      if (got.status === 'ok') {
        remote = got.current.record;
        remoteVersion = got.current.version;
      } else if (got.status === 'none') {
        remote = null;
        remoteVersion = 0;
      } else return setStatus(failed(got.status));
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const local = syncedPart(deps.readLocal());
      const merged = mergeRecords(meta.base, local, remote);
      if (!same(merged, local)) deps.applyLocal(merged);
      if (remote && remoteVersion > 0 && same(merged, remote)) {
        deps.saveMeta({ ...meta, base: merged, version: remoteVersion, lastSyncedAt: now() });
        return setStatus('synced');
      }
      const put = await deps.api.put(merged, remoteVersion);
      if (put.status === 'ok') {
        deps.saveMeta({ ...meta, base: merged, version: put.version, lastSyncedAt: now() });
        return setStatus('synced');
      }
      if (put.status !== 'conflict') return setStatus(failed(put.status));
      // Another device saved first: merge with its copy and try again. Base stays the last copy this device synced.
      remote = put.current?.record ?? null;
      remoteVersion = put.current?.version ?? 0;
    }
    return setStatus('error');
  }

  async function sync({ pull = false }: { pull?: boolean } = {}): Promise<SyncStatus> {
    if (running) {
      again = { pull: (again?.pull ?? false) || pull };
      return running;
    }
    running = (async () => {
      let result = await runOnce(pull);
      while (again) {
        const next = again;
        again = null;
        result = await runOnce(next.pull);
      }
      return result;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    sync,
    async enable() {
      const uid = await deps.currentUserId();
      if (!uid) return setStatus('signed-out');
      const meta = deps.loadMeta();
      // Turning on again for the same account keeps the base; a different account starts fresh.
      deps.saveMeta(meta.userId === uid ? { ...meta, enabled: true } : { ...OFF, enabled: true, userId: uid });
      return sync({ pull: true });
    },
    async disable({ deleteServerCopy = false } = {}) {
      if (running) await running.catch(() => undefined);
      const meta = deps.loadMeta();
      deps.saveMeta({ ...OFF });
      setStatus('off');
      if (!deleteServerCopy) return { deleted: false };
      const uid = await deps.currentUserId();
      if (!uid || uid !== meta.userId) return { deleted: 'failed' };
      const out = await deps.api.delete();
      return { deleted: out.status === 'ok' || out.status === 'none' ? true : 'failed' };
    },
    async restoreAfterLogin() {
      const uid = await deps.currentUserId();
      if (!uid) return false;
      const got = await deps.api.get();
      if (got.status !== 'ok') return false;
      const local = syncedPart(deps.readLocal());
      deps.applyLocal(mergeRecords(null, local, got.current.record));
      deps.saveMeta({ enabled: true, userId: uid, base: null, version: 0, lastSyncedAt: null });
      await sync({ pull: true });
      return true;
    },
    status: () => status,
  };
}
