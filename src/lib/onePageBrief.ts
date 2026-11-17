/**
 * The one-page doctor brief (ADR-009). Shared by the server (links, server/shares/brief.ts re-exports it) and the device
 * (Download PDF, ShowInRoom print mode), so a printed PDF and a shared link fit the page the same way. Rebuilds the brief from the request using known fields only,
 * then fits it to one printed page: lists are capped and long text is shortened with "…" (never
 * rejected for being long, so a patient's share still works). `trimmed` says whether anything was cut.
 *
 * The content is the patient's own words and the app's vetted doctor-terms lines; no AI writes it.
 * Crisis language anywhere means the brief is not shared (the caller shows crisis support instead).
 */
import { hasCrisisLanguage } from './safety.js';
import type { BriefSnapshot, CaseSnapshot } from './types.js';

/** What fits on one printed page (A1 layout in Brief.tsx). */
export const ONE_PAGE = {
  who: 120,
  patient: 120,
  impact: 200,
  priorities: { max: 3, chars: 200 },
  symptoms: { max: 6, label: 40, clinical: 300, quote: 240 },
  tried: 300,
  timeline: { max: 5, chars: 200 },
  askingFor: { max: 5, chars: 120 },
} as const;

/** The shareable record (ADR-020): the case history, a second page after the one-page brief. */
export const CASE_PAGE = {
  presenting: { max: 10, chars: 200 },
  course: { max: 6, chars: 300 },
  medications: { max: 10, chars: 200 },
  patterns: { max: 5, chars: 500 },
  openItems: { max: 5, chars: 300 },
  keyDates: { max: 6, chars: 250 },
  visits: { max: 10, clinician: 100 },
} as const;

/** Anything beyond these is not a real brief: rejected instead of trimmed. */
const HARD = { chars: 5000, items: 50 };

export type BriefParse =
  | { ok: true; brief: BriefSnapshot; trimmed: boolean }
  | { ok: false; reason: 'invalid' | 'empty' | 'crisis' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildOnePageBrief(input: unknown): BriefParse {
  if (!isObj(input)) return { ok: false, reason: 'invalid' };
  let trimmed = false;
  let bad = false;

  const text = (v: unknown, max: number, optional = false): string => {
    if (v === undefined && optional) return '';
    if (typeof v !== 'string' || v.length > HARD.chars) { bad = true; return ''; }
    const t = v.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    trimmed = true;
    return `${t.slice(0, max - 1).trimEnd()}…`;
  };
  const list = <T>(v: unknown, max: number, item: (x: unknown) => T, optional = false): T[] => {
    if (v === undefined && optional) return [];
    if (!Array.isArray(v) || v.length > HARD.items) { bad = true; return []; }
    if (v.length > max) trimmed = true;
    return v.slice(0, max).map(item);
  };
  const flag = (v: unknown): boolean | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== 'boolean') bad = true;
    return v === true;
  };

  const visitDate = input.visitDate;
  if (visitDate !== undefined && (typeof visitDate !== 'string' || !DATE.test(visitDate))) bad = true;

  const patient = text(input.patient, ONE_PAGE.patient, true);
  const impact = text(input.impact, ONE_PAGE.impact, true);
  const brief: BriefSnapshot = {
    who: text(input.who, ONE_PAGE.who, true),
    ...(flag(input.includeTalkingPoints) === false ? { includeTalkingPoints: false } : {}),
    ...(flag(input.includeSummary) === false ? { includeSummary: false } : {}),
    ...(typeof visitDate === 'string' && DATE.test(visitDate) ? { visitDate } : {}),
    ...(patient ? { patient } : {}),
    ...(impact ? { impact } : {}),
    priorities: list(input.priorities, ONE_PAGE.priorities.max, (p) => text(p, ONE_PAGE.priorities.chars)).filter(Boolean),
    symptoms: list(input.symptoms, ONE_PAGE.symptoms.max, (s) => {
      if (!isObj(s)) { bad = true; return { label: '', clinical: '' }; }
      const quote = text(s.quote, ONE_PAGE.symptoms.quote, true);
      return { label: text(s.label, ONE_PAGE.symptoms.label), clinical: text(s.clinical, ONE_PAGE.symptoms.clinical), ...(quote ? { quote } : {}) };
    }).filter((s) => s.label && s.clinical),
    tried: text(input.tried, ONE_PAGE.tried, true),
    timeline: list(input.timeline, ONE_PAGE.timeline.max, (e) => {
      if (!isObj(e) || typeof e.date !== 'string' || !DATE.test(e.date)) { bad = true; return { date: '', detail: '' }; }
      return { date: e.date, detail: text(e.detail, ONE_PAGE.timeline.chars) };
    }, true).filter((e) => e.detail),
    askingFor: list(input.askingFor, ONE_PAGE.askingFor.max, (a) => text(a, ONE_PAGE.askingFor.chars), true).filter(Boolean),
    demo: flag(input.demo) === true,
  };

  // The optional case history (ADR-020): the same rules, its own caps.
  if (input.case !== undefined) {
    const c = input.case;
    if (!isObj(c)) bad = true;
    else {
      const lines = (v: unknown, cap: { max: number; chars: number }) => list(v, cap.max, (x) => text(x, cap.chars), true).filter(Boolean);
      const snapshot: CaseSnapshot = {
        presenting: lines(c.presenting, CASE_PAGE.presenting),
        course: lines(c.course, CASE_PAGE.course),
        medications: lines(c.medications, CASE_PAGE.medications),
        patterns: lines(c.patterns, CASE_PAGE.patterns),
        openItems: lines(c.openItems, CASE_PAGE.openItems),
        keyDates: list(c.keyDates, CASE_PAGE.keyDates.max, (k) => {
          if (!isObj(k) || typeof k.date !== 'string' || !DATE.test(k.date)) { bad = true; return { date: '', text: '' }; }
          return { date: k.date, text: text(k.text, CASE_PAGE.keyDates.chars) };
        }, true).filter((k) => k.text),
        visits: list(c.visits, CASE_PAGE.visits.max, (x) => {
          if (!isObj(x) || typeof x.date !== 'string' || !DATE.test(x.date)) { bad = true; return { date: '' }; }
          const fh = x.feltHeard;
          if (fh !== undefined && (typeof fh !== 'number' || !Number.isInteger(fh) || fh < 1 || fh > 5)) bad = true;
          const clinician = text(x.clinician, CASE_PAGE.visits.clinician, true);
          return { date: x.date, ...(clinician ? { clinician } : {}), ...(typeof fh === 'number' ? { feltHeard: fh } : {}) };
        }, true),
      };
      const hasAny = Object.values(snapshot).some((v) => v.length > 0);
      if (hasAny) brief.case = snapshot;
    }
  }
  if (bad) return { ok: false, reason: 'invalid' };

  const c = brief.case;
  const caseText = c ? [...c.presenting, ...c.course, ...c.medications, ...c.patterns, ...c.openItems, ...c.keyDates.map((k) => k.text), ...c.visits.map((v) => v.clinician)] : [];
  const allText = [brief.who, brief.patient, brief.impact, ...brief.priorities, ...brief.symptoms.flatMap((s) => [s.label, s.clinical, s.quote]), brief.tried, ...brief.timeline.map((e) => e.detail), ...brief.askingFor, ...caseText];
  if (hasCrisisLanguage(...allText)) return { ok: false, reason: 'crisis' };
  if (!brief.priorities.length && !brief.symptoms.length && !brief.askingFor.length && !(brief.tried && brief.tried !== 'Not discussed')) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true, brief, trimmed };
}

/**
 * For printing on the device (Download PDF): the brief fitted to one page with the same rules as shared links, plus
 * whether anything was shortened. If the brief can't be fitted (crisis words, nothing to show, odd data), it is printed
 * as-is: the print view never hides what the patient asked to print.
 */
export function fitToOnePage(brief: BriefSnapshot): { brief: BriefSnapshot; trimmed: boolean } {
  const out = buildOnePageBrief(brief);
  return out.ok ? { brief: out.brief, trimmed: out.trimmed } : { brief, trimmed: false };
}
