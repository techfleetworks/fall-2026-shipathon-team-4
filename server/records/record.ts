/**
 * What a saved record may contain (ADR-018). Allow-list only: the app's own record fields, in the shape the screens
 * use (AppData in src/lib/store.ts). Unknown fields are dropped. Never stored, even if the app sends them:
 *  - the local-only password hash and the email (the email belongs to the sign-in account),
 *  - share links (they hold link tokens; doctor links are stored separately as hashes, ADR-009),
 *  - session flags (signedIn, demoMode).
 * The content itself is the person's own record, so it is not rewritten or checked for wording, only for shape and size.
 */
export const MAX_RECORD_BYTES = 512 * 1024;
export const MAX_LIST_ITEMS = 1000;

/** Lists of { id, ... } entries. */
const ENTRY_LISTS = ['medications', 'summaries', 'evidence', 'visits', 'followUps', 'sharedTips', 'myPlaybooks'] as const;
const PROFILE_DROP = ['passwordHash', 'email'] as const;

export type SavedRecord = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The record to store, or undefined if its shape is wrong or it's too big. */
export function parseSavedRecord(input: unknown): SavedRecord | undefined {
  if (!isObj(input)) return undefined;
  const out: SavedRecord = {};

  if (input.profile !== undefined) {
    if (input.profile !== null && !isObj(input.profile)) return undefined;
    if (input.profile) {
      const profile = { ...input.profile };
      for (const k of PROFILE_DROP) delete profile[k];
      out.profile = profile;
    } else out.profile = null;
  }

  for (const k of ENTRY_LISTS) {
    const list = input[k];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > MAX_LIST_ITEMS) return undefined;
    if (!list.every((e) => isObj(e) && typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 64)) return undefined;
    out[k] = list;
  }

  if (input.savedScripts !== undefined) {
    const s = input.savedScripts;
    if (!Array.isArray(s) || s.length > MAX_LIST_ITEMS || !s.every((x) => typeof x === 'string' && x.length <= 100)) return undefined;
    out.savedScripts = s;
  }
  if (input.notifications !== undefined) {
    if (!isObj(input.notifications)) return undefined;
    out.notifications = input.notifications;
  }
  if (input.morning !== undefined) {
    if (!isObj(input.morning)) return undefined;
    out.morning = input.morning;
  }
  if (input.textScale !== undefined) {
    if (typeof input.textScale !== 'number' || !Number.isFinite(input.textScale) || input.textScale < 0.5 || input.textScale > 3) return undefined;
    out.textScale = input.textScale;
  }

  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > MAX_RECORD_BYTES) return undefined;
  return out;
}
