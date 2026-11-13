/**
 * Plain-language lab results (board card "Plain-language explainer on labs & notes", ADR-008).
 *
 * For each result: what the test measures (from the reviewed glossary, ADR-007) and where the value
 * sits against the typical range printed on the report: above, within or below, or how much a
 * before → after reading changed. Nothing more: never what it means for the person's health, never
 * what to do. Free, deterministic, runs on the device and the server.
 *
 * Only compared when it's safe to: both numbers readable and no unit mismatch. Otherwise it says so.
 */
import { findTerms } from '../explain/explain.js';
import { guardResponse, type Violation } from '../guardrails/index.js';

export interface LabRow {
  test: string;
  value: string;
  /** As printed on the report, e.g. "70-99", "< 200", "4–15 ng/mL". Optional. */
  typicalRange?: string;
}

export type LabPosition = 'above' | 'within' | 'below' | 'change' | 'no-range' | 'not-compared';

export interface LabExplanation {
  test: string;
  value: string;
  typicalRange?: string;
  position: LabPosition;
  /** One neutral sentence about where the value sits. */
  summary: string;
  /** What the test measures, from the glossary. Absent if the test isn't in the glossary. */
  about?: string;
}

export type LabsResult =
  | { status: 'crisis' }
  | { status: 'blocked'; message: string; violations: Violation[] }
  | { status: 'ok'; labs: LabExplanation[] };

/** Shown once with any lab results. */
export const LABS_NOTE = 'Typical ranges differ between labs. The range printed on your report is the one that applies to you.';

export const MAX_LAB_ROWS = 100;
export const MAX_LAB_FIELD_CHARS = 200;

const NUM = String.raw`[-+]?\d+(?:\.\d+)?`;

/** The first number in the text and the unit right after it (e.g. "104 mg/dL" → 104, "mg/dl"). */
function numberAndUnit(text: string): { n: number; unit: string } | undefined {
  const m = new RegExp(`(${NUM})\\s*([a-zA-Zµ%/][a-zA-Zµ%/0-9.]*)?`).exec(text);
  if (!m) return undefined;
  return { n: Number(m[1]), unit: (m[2] ?? '').toLowerCase() };
}

interface Range {
  low?: number;
  high?: number;
  unit: string;
  shown: string;
}

/** "70-99", "4–15 ng/mL", "< 200", "<= 5.6", "> 40". Anything else is not a range we can read. */
export function parseRange(text: string): Range | undefined {
  const t = text.trim();
  const between = new RegExp(`^(${NUM})\\s*(?:-|–|—|to)\\s*(${NUM})\\s*([a-zA-Zµ%/][\\w/%µ.]*)?$`, 'i').exec(t);
  if (between) {
    const [low, high] = [Number(between[1]), Number(between[2])];
    if (low > high) return undefined;
    return { low, high, unit: (between[3] ?? '').toLowerCase(), shown: t };
  }
  const bound = new RegExp(`^(<|≤|<=|>|≥|>=)\\s*(${NUM})\\s*([a-zA-Zµ%/][\\w/%µ.]*)?$`).exec(t);
  if (bound) {
    const n = Number(bound[2]);
    const unit = (bound[3] ?? '').toLowerCase();
    return bound[1].startsWith('<') || bound[1] === '≤' ? { high: n, unit, shown: t } : { low: n, unit, shown: t };
  }
  return undefined;
}

/** "118/76 -> 98/64 mmHg" or "80 -> 72 kg": a before → after reading. */
function describeChange(value: string): string | undefined {
  const pair = /(\d+)\s*\/\s*(\d+)\s*(?:->|→|to)\s*(\d+)\s*\/\s*(\d+)/i.exec(value);
  if (pair) {
    const [a1, b1, a2, b2] = pair.slice(1, 5).map(Number);
    return `The top number went from ${a1} to ${a2} (${moved(a2 - a1)}), and the bottom number from ${b1} to ${b2} (${moved(b2 - b1)}).`;
  }
  const single = new RegExp(`(${NUM})\\s*(?:->|→)\\s*(${NUM})`).exec(value);
  if (single) {
    const [a, b] = [Number(single[1]), Number(single[2])];
    return `It went from ${a} to ${b} (${moved(b - a)}).`;
  }
  return undefined;
}

const moved = (d: number) => (d === 0 ? 'no change' : `${d > 0 ? 'up' : 'down'} ${Math.abs(Number(d.toFixed(2)))}`);
const isBlankRange = (r?: string) => !r || /^[\s—–-]*$/.test(r) || /^n\/?a$/i.test(r.trim());

export function explainLab(row: LabRow): LabExplanation {
  const about = findTerms(row.test).find((e) => e.kind === 'term')?.plain;
  const base = { test: row.test, value: row.value, ...(row.typicalRange ? { typicalRange: row.typicalRange } : {}), ...(about ? { about } : {}) };

  const change = describeChange(row.value);
  if (change) return { ...base, position: 'change', summary: change };

  if (isBlankRange(row.typicalRange)) {
    return { ...base, position: 'no-range', summary: 'No typical range was given for this result, so it isn’t compared.' };
  }
  const range = parseRange(row.typicalRange!);
  const value = numberAndUnit(row.value);
  if (!range || !value || (range.unit && value.unit && range.unit !== value.unit)) {
    return { ...base, position: 'not-compared', summary: 'This result couldn’t be compared with the range shown. Your clinician can explain it.' };
  }
  const shown = `the typical range shown (${range.shown})`;
  if (range.high !== undefined && value.n > range.high) return { ...base, position: 'above', summary: `${row.value.trim()} is above ${shown}.` };
  if (range.low !== undefined && value.n < range.low) return { ...base, position: 'below', summary: `${row.value.trim()} is below ${shown}.` };
  return { ...base, position: 'within', summary: `${row.value.trim()} is within ${shown}.` };
}

/** All rows, guarded: crisis words anywhere → crisis path; a line breaking a rule → blocked. */
export function explainLabs(rows: readonly LabRow[]): LabsResult {
  const labs = rows.map(explainLab);
  const input = rows.map((r) => [r.test, r.value, r.typicalRange].filter(Boolean).join(' ')).join('\n');
  const output = labs.flatMap((l) => [l.summary, l.about ?? '']).filter(Boolean).join('\n');
  const guarded = guardResponse(output, { input });
  if (guarded.status === 'ok') return { status: 'ok', labs };
  return guarded;
}

/**
 * Reads lab rows from CSV with a header containing "test" and "value" (and optionally "typical_range"),
 * like the Starter Pack's labs.csv. Other columns (e.g. plain_meaning) are ignored on purpose.
 * Returns undefined if the header isn't recognised.
 */
export function parseLabsCsv(csv: string): LabRow[] | undefined {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return undefined;
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const [ti, vi, ri] = [header.indexOf('test'), header.indexOf('value'), header.indexOf('typical_range')];
  if (ti < 0 || vi < 0) return undefined;
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const typicalRange = ri >= 0 ? cells[ri]?.trim() : undefined;
    return { test: (cells[ti] ?? '').trim(), value: (cells[vi] ?? '').trim(), ...(typicalRange ? { typicalRange } : {}) };
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}
