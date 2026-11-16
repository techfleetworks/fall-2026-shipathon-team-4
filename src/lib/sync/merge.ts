/**
 * Visit store merge (ADR-019): combines this device's record with the server's, entry by entry, so nothing a person
 * added on either device is lost and nothing they deleted comes back.
 *
 * Three-way merge against `base`, the record as it was at the last successful sync on this device:
 *   - entry on both sides: whichever side changed it since base wins; if BOTH changed it, this device wins (the person
 *     is using it right now). Same rule for single fields (profile, settings).
 *   - entry on one side only: if base had it, the other side deleted it → stays deleted, unless this side edited it
 *     since (an edit beats a delete). If base didn't have it, it's new → kept.
 *   - no base (first sync on this device): nothing counts as deleted; entries from both sides are kept.
 * Order: this device's order, then entries only the server has, in the server's order.
 */

/** The record fields that sync (the server's allow-list, server/records/record.ts). */
export const ENTRY_LISTS = ['medications', 'summaries', 'evidence', 'visits', 'followUps', 'sharedTips', 'myPlaybooks'] as const;
export const SINGLE_FIELDS = ['profile', 'savedScripts', 'notifications', 'morning', 'textScale'] as const;
/** Profile fields that never leave the device. */
export const LOCAL_ONLY_PROFILE = ['passwordHash', 'email'] as const;

export type EntryList = (typeof ENTRY_LISTS)[number];
export type SyncRecord = Partial<Record<EntryList, { id: string }[]>> & Partial<Record<(typeof SINGLE_FIELDS)[number], unknown>>;

/** JSON with sorted keys, so two equal values always compare equal. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
export const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

/** Only the synced fields of a record, with local-only profile fields removed. */
export function syncedPart(source: Record<string, unknown>): SyncRecord {
  const out: Record<string, unknown> = {};
  for (const k of ENTRY_LISTS) if (Array.isArray(source[k])) out[k] = source[k];
  for (const k of SINGLE_FIELDS) {
    if (source[k] === undefined) continue;
    if (k === 'profile' && source.profile && typeof source.profile === 'object') {
      const p = { ...(source.profile as Record<string, unknown>) };
      for (const f of LOCAL_ONLY_PROFILE) delete p[f];
      out.profile = p;
    } else out[k] = source[k];
  }
  return out as SyncRecord;
}

function mergeField(base: unknown, local: unknown, remote: unknown, hasBase: boolean): unknown {
  if (same(local, remote)) return local;
  if (hasBase && same(local, base)) return remote; // only the server changed it
  if (local === undefined || local === null) return remote; // nothing here yet (e.g. a new device)
  return local; // only this device changed it, or both did
}

function mergeList(base: { id: string }[] | undefined, local: { id: string }[] = [], remote: { id: string }[] = [], hasBase: boolean) {
  const byId = (xs: { id: string }[] | undefined) => new Map((xs ?? []).map((x) => [x.id, x]));
  const b = byId(base);
  const r = byId(remote);
  const l = byId(local);
  const out: { id: string }[] = [];
  for (const item of local) {
    const other = r.get(item.id);
    const was = b.get(item.id);
    if (other) {
      out.push(hasBase && was && same(item, was) ? other : item);
    } else if (hasBase && was && same(item, was)) {
      // The server deleted it and this device didn't edit it: keep it deleted.
    } else out.push(item);
  }
  for (const item of remote) {
    if (l.has(item.id)) continue;
    const was = b.get(item.id);
    if (hasBase && was && same(item, was)) continue; // this device deleted it, the server didn't edit it
    out.push(item);
  }
  return out;
}

/** The merged record. `base` null = first sync on this device. `remote` null = nothing on the server yet. */
export function mergeRecords(base: SyncRecord | null, local: SyncRecord, remote: SyncRecord | null): SyncRecord {
  if (!remote) return local;
  const hasBase = base !== null;
  const out: Record<string, unknown> = {};
  for (const k of ENTRY_LISTS) {
    if (local[k] === undefined && remote[k] === undefined) continue;
    out[k] = mergeList(base?.[k], local[k], remote[k], hasBase);
  }
  for (const k of SINGLE_FIELDS) {
    const v = mergeField(base?.[k], local[k], remote[k], hasBase);
    if (v !== undefined) out[k] = v;
  }
  return out as SyncRecord;
}
