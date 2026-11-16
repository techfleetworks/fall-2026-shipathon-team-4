/**
 * Clinical → plain explainer (ADR-007). Finds clinical terms and note shorthand in a piece of text
 * (a clinical note, what the doctor said, the app's own doctor-terms lines) and returns the vetted
 * plain explanation for each, in the order they appear.
 *
 * Free and deterministic: explanations come only from glossary.ts, never generated. Still guarded:
 *   crisis language in the text → crisis path (nothing explained; checked by guardResponse)
 *   any explanation breaking a rule → blocked (the honest fallback); the tests keep this from happening
 * Runs the same in the browser and on the server (.js imports for Node).
 */
import { guardResponse, type Violation } from '../guardrails/index.js';
import { GLOSSARY, plainFor, type GlossaryKind } from './glossary.js';

/** Longest text accepted (a long clinical note or visit transcript excerpt). */
export const MAX_EXPLAIN_CHARS = 20_000;

export interface Explanation {
  id: string;
  /** Display name of the term, e.g. "Somnolence". */
  term: string;
  kind: GlossaryKind;
  /** Exactly what was found in the text, e.g. "5/52" or "somnolence". */
  found: string;
  /** The plain explanation. */
  plain: string;
}

export type ExplainResult =
  | { status: 'crisis' }
  | { status: 'blocked'; message: string; violations: Violation[] }
  | { status: 'ok'; explanations: Explanation[] };

interface Hit extends Explanation {
  start: number;
  end: number;
}

/** Every glossary match, longest-first per position, without overlaps and without repeats. */
export function findTerms(text: string): Explanation[] {
  const hits: Hit[] = [];
  for (const entry of GLOSSARY) {
    const re = new RegExp(entry.match.source, entry.match.flags.includes('g') ? entry.match.flags : `${entry.match.flags}g`);
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // An earlier (more specific) entry already covers this span, e.g. "BP" inside "postural BP".
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ id: entry.id, term: entry.term, kind: entry.kind, found: m[0], plain: plainFor(entry, m as RegExpExecArray), start, end });
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const seen = new Set<string>();
  const out: Explanation[] = [];
  for (const { start: _s, end: _e, ...e } of hits) {
    // The same term once; numbered shorthand once per distinct value ("5/52" and "4/52" both explained).
    const key = e.kind === 'shorthand' && typeof GLOSSARY.find((g) => g.id === e.id)?.plain === 'function' ? `${e.id}:${e.found}` : e.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function explainClinical(text: string): ExplainResult {
  const explanations = findTerms(text);
  const output = explanations.map((e) => e.plain).join('\n');
  const guarded = guardResponse(output, { input: text });
  if (guarded.status === 'ok') return { status: 'ok', explanations };
  return guarded;
}
