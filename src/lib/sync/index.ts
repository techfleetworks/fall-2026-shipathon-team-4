/**
 * Visit store sync, wired into the app (ADR-019). Started once from main.tsx; screens use `useSyncState`,
 * `turnOnSync`, `turnOffSync` and `restoreBackupAfterLogin`.
 *
 * Only on the real users' site with server sign-in. Never for the demo (Theo) or the on-device-only version.
 * When it syncs: on start, ~2 s after the record changes, when the connection comes back, and when the person
 * returns to the app (so changes from their other devices show up).
 */
import { create } from 'zustand';
import { isServerAuthEnabled } from '../auth';
import { SITE } from '../siteMode';
import { SYNC_STORAGE_KEY, useApp } from '../store';
import { supabase } from '../supabaseClient';
import { createSyncEngine, OFF, type SyncEngine, type SyncMeta, type SyncStatus } from './engine';
import { LOCAL_ONLY_PROFILE, type SyncRecord } from './merge';
import { deleteRecord, getRecord, putRecord } from './recordApi';

export { SYNC_STORAGE_KEY };
const CHANGE_DELAY_MS = 2000;

/** `enabled` = backup is really on for this device (the switch shows this); `status` = what the last attempt did. */
export const useSyncState = create<{ enabled: boolean; status: SyncStatus; lastSyncedAt: string | null }>(() => ({ enabled: false, status: 'off', lastSyncedAt: null }));

/** Sync is offered only on the real users' site with server sign-in. */
export const syncAvailable = () => isServerAuthEnabled() && SITE.mode !== 'demo';

function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    return raw ? { ...OFF, ...(JSON.parse(raw) as Partial<SyncMeta>) } : { ...OFF };
  } catch {
    return { ...OFF };
  }
}
function saveMeta(meta: SyncMeta) {
  try {
    if (!meta.enabled && !meta.userId) localStorage.removeItem(SYNC_STORAGE_KEY);
    else localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* storage unavailable: sync just won't remember between visits */
  }
}

function applyLocal(merged: SyncRecord) {
  useApp.setState((s) => {
    const next: Record<string, unknown> = { ...merged };
    if (merged.profile && typeof merged.profile === 'object') {
      // Keep this device's local-only profile fields (password hash, email).
      const keep = Object.fromEntries(LOCAL_ONLY_PROFILE.filter((k) => s.profile?.[k] !== undefined).map((k) => [k, s.profile![k]]));
      next.profile = { ...(merged.profile as object), ...keep };
    }
    return next as Partial<typeof s>;
  });
}

let engine: SyncEngine | null = null;

function getEngine(): SyncEngine {
  engine ??= createSyncEngine({
    currentUserId: async () => (supabase ? (await supabase.auth.getSession()).data.session?.user.id ?? null : null),
    readLocal: () => useApp.getState() as unknown as Record<string, unknown>,
    applyLocal,
    loadMeta,
    saveMeta,
    api: { get: () => getRecord(), put: (r, v) => putRecord(r, v), delete: () => deleteRecord() },
    onStatus: (status, meta) => useSyncState.setState({ enabled: meta.enabled, status, lastSyncedAt: meta.lastSyncedAt }),
  });
  return engine;
}

const blocked = () => !syncAvailable() || useApp.getState().demoMode;

export function syncNow(pull = false): Promise<SyncStatus> | undefined {
  if (blocked() || !loadMeta().enabled) return undefined;
  return getEngine().sync({ pull });
}

export async function turnOnSync(): Promise<SyncStatus> {
  if (blocked()) return 'off';
  return getEngine().enable();
}

export async function turnOffSync(deleteServerCopy: boolean) {
  return getEngine().disable({ deleteServerCopy });
}

/** After log-in on a device without this account's data: restore their backup if they have one. */
export async function restoreBackupAfterLogin(): Promise<boolean> {
  if (blocked()) return false;
  return getEngine().restoreAfterLogin();
}

let started = false;
export function startRecordSync() {
  if (started || !syncAvailable()) return;
  started = true;
  const meta = loadMeta();
  useSyncState.setState({ enabled: meta.enabled, status: meta.enabled ? 'synced' : 'off', lastSyncedAt: meta.lastSyncedAt });

  let timer: ReturnType<typeof setTimeout> | undefined;
  useApp.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(false), CHANGE_DELAY_MS);
  });
  window.addEventListener('online', () => void syncNow(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow(true);
  });
  void syncNow(true);
}
