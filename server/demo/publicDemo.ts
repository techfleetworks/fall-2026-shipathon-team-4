/**
 * The public Theo demo (ADR-010): what GET /api/demo may return, and keeping its dates current.
 *
 * Only an allow-list of app fields leaves the server, and the profile keeps only display fields:
 * never an email, a password hash, share links or settings, even if they were stored by mistake.
 * The record is SYNTHETIC (Starter Pack); the response says so.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Whole days from `anchor` to `today` (both YYYY-MM-DD), in UTC so time zones can't add or drop a day. */
export function daysBetween(anchor: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function shiftOne(value: string, days: number): string {
  const m = DATE.exec(value);
  if (!m) return value;
  if (!m[4]) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
    return d.toISOString().slice(0, 10);
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? value : new Date(t + days * 86_400_000).toISOString();
}

/** Moves every date (YYYY-MM-DD) and timestamp in the data forward by `days`, so relative times stay true. */
export function shiftDates<T>(value: T, days: number): T {
  if (days === 0) return value;
  if (typeof value === 'string') return shiftOne(value, days) as T;
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, days)])) as T;
  }
  return value;
}

/** App fields a public visitor may see (the shape of AppData in src/lib/store.ts). */
const LIST_FIELDS = ['medications', 'summaries', 'evidence', 'visits', 'followUps', 'savedScripts', 'sharedTips', 'myPlaybooks'] as const;
const PROFILE_FIELDS = ['name', 'lastName', 'age', 'forWhom', 'reasons', 'brushedOff', 'consentAccepted', 'ageConfirmed', 'onboarded'] as const;
const MAX_ITEMS = 200;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps only the allow-listed fields. Returns undefined if the record isn't usable as a demo. */
export function safeDemoData(raw: unknown): Record<string, unknown> | undefined {
  if (!isObj(raw) || !isObj(raw.profile)) return undefined;
  const profile = Object.fromEntries(PROFILE_FIELDS.filter((k) => k in (raw.profile as object)).map((k) => [k, (raw.profile as Record<string, unknown>)[k]]));
  if (typeof profile.name !== 'string' || !profile.name) return undefined;
  const out: Record<string, unknown> = { profile: { ...profile, onboarded: true, consentAccepted: true }, demoMode: true };
  for (const k of LIST_FIELDS) out[k] = Array.isArray(raw[k]) ? (raw[k] as unknown[]).slice(0, MAX_ITEMS) : [];
  return out;
}
