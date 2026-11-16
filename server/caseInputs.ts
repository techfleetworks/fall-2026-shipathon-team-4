/**
 * Reads the body of POST /api/case-summary into the slim record the case-view engine needs (ADR-017).
 * Known fields only, every string and list within limits, dates as YYYY-MM-DD. Anything else → undefined
 * (the route answers 400 INVALID_CASE). Unknown fields are dropped, never stored or logged.
 */
import type { CaseInputs } from '../src/lib/caseView/caseView.js';
import type { EvidenceType, FollowUp } from '../src/lib/types.js';

export const MAX_CASE_ITEMS = 500;
export const MAX_CASE_TEXT = 2000;
export const MAX_PRIORITIES = 10;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVIDENCE_TYPES: readonly EvidenceType[] = ['visit', 'medication', 'symptom', 'note', 'follow-up'];
const OUTCOMES: readonly NonNullable<FollowUp['outcome']>[] = ['Happened', 'Not yet', 'Didn’t happen'];

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function str(v: unknown, { optional = false, max = MAX_CASE_TEXT } = {}): string {
  if (v === undefined && optional) return '';
  if (typeof v !== 'string' || v.length > max) throw new Invalid();
  return v;
}
function date(v: unknown): string {
  if (typeof v !== 'string' || !DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Invalid();
  return v;
}
function list<T>(v: unknown, each: (x: Record<string, unknown>) => T, max = MAX_CASE_ITEMS): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) throw new Invalid();
  return v.map((x) => {
    if (!isObj(x)) throw new Invalid();
    return each(x);
  });
}
function strings(v: unknown, max: number): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) throw new Invalid();
  return v.map((x) => str(x, { max: 300 }));
}

function checkIn(v: unknown): { feltHeard: number } {
  if (!isObj(v) || !Number.isInteger(v.feltHeard) || (v.feltHeard as number) < 1 || (v.feltHeard as number) > 5) throw new Invalid();
  return { feltHeard: v.feltHeard as number };
}
function afterVisit(v: unknown): { talkingPoints: { text: string; raised: boolean }[] } {
  if (!isObj(v)) throw new Invalid();
  return {
    talkingPoints: list(v.talkingPoints, (p) => {
      if (typeof p.raised !== 'boolean') throw new Invalid();
      return { text: str(p.text, { max: 300 }), raised: p.raised };
    }, MAX_PRIORITIES),
  };
}

export function parseCaseInputs(body: unknown): CaseInputs | undefined {
  if (!isObj(body)) return undefined;
  try {
    return {
      medications: list(body.medications, (m) => ({ id: str(m.id, { max: 64 }), name: str(m.name, { max: 200 }), dose: str(m.dose, { optional: true, max: 200 }), started: date(m.started), note: str(m.note, { optional: true }) || undefined })),
      evidence: list(body.evidence, (e) => {
        if (!EVIDENCE_TYPES.includes(e.type as EvidenceType)) throw new Invalid();
        return { id: str(e.id, { max: 64 }), date: date(e.date), type: e.type as EvidenceType, title: str(e.title, { max: 200 }), detail: str(e.detail, { optional: true }) };
      }),
      visits: list(body.visits, (v) => ({
        id: str(v.id, { max: 64 }),
        date: date(v.date),
        clinician: str(v.clinician, { optional: true, max: 200 }) || undefined,
        priorities: strings(v.priorities, MAX_PRIORITIES),
        covered: v.covered === undefined ? undefined : strings(v.covered, MAX_PRIORITIES),
        checkIn: v.checkIn === undefined ? undefined : checkIn(v.checkIn),
        afterVisit: v.afterVisit === undefined ? undefined : afterVisit(v.afterVisit),
      })),
      followUps: list(body.followUps, (f) => {
        if (f.outcome !== undefined && !OUTCOMES.includes(f.outcome as NonNullable<FollowUp['outcome']>)) throw new Invalid();
        return { id: str(f.id, { max: 64 }), step: str(f.step, { max: 300 }), dueDate: date(f.dueDate), outcome: f.outcome as FollowUp['outcome'] };
      }),
    };
  } catch (e) {
    if (e instanceof Invalid) return undefined;
    throw e;
  }
}
