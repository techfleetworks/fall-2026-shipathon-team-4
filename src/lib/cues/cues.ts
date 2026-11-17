/**
 * Real-time "be-believed" cues for At the visit (board card "Real-time prompts / checklist during the visit", ADR-022).
 *
 * Reads what was said so far (the live transcript's finished pieces, ADR-021, and the typed quick notes) and, when a known
 * dismissing moment comes up, offers the matching line from the reviewed playbook library (src/data/scripts.ts). No new
 * wording is written here: the cue IS the playbook line, with its blanks filled from the person's own record when possible.
 * It also notices when a talking point seems to have come up, so the person can tick it (never ticked automatically).
 *
 * Speech recognition can't tell who is speaking, so a cue only says what was heard and what the person could say.
 * Crisis language anywhere → no cues (the 988 banner shows instead). Free, rule-based, on the device.
 */
import { SCRIPTS, type Script } from '../../data/scripts.js';
import { sameConcern } from '../caseView/caseView.js';
import { hasCrisisLanguage } from '../safety.js';
import { matchSymptoms } from '../translate.js';

export interface Cue {
  /** The playbook script id (one cue per script per visit). */
  id: string;
  /** The words that triggered it, as heard (shortened). */
  heard: string;
  /** The playbook's situation, e.g. "If you hear “it’s just anxiety”". */
  situation: string;
  /** What the person could say: the playbook line, blanks filled from their record where possible. */
  say: string;
}

export interface CueContext {
  /** The visit's talking points and the ones already ticked. */
  priorities: readonly string[];
  covered: readonly string[];
  /** For the playbook blanks. */
  latestMedChange?: { label: string; date: string };
  lastVisitDate?: string;
  /** Cues the person already dismissed ("Got it"). */
  dismissed?: readonly string[];
}

export interface CueResult {
  /** Newest first, at most MAX_CUES. */
  cues: Cue[];
  /** Talking points that seem to have come up but aren't ticked. */
  coveredSuggestions: string[];
}

export const MAX_CUES = 2;

/** Moment → playbook script. Patterns are deliberately specific: a missed cue is better than a wrong one. */
export const TRIGGERS: readonly { scriptId: string; pattern: RegExp }[] = [
  { scriptId: 'dismiss-anxiety', pattern: /\b(?:just|only|probably|likely|it'?s)\s+(?:your\s+)?(?:anxiety|stress|nerves)\b|\ball in your head\b/i },
  { scriptId: 'dismiss-depression', pattern: /\b(?:just|only|probably|likely|it'?s|part of)\s+(?:the\s+|your\s+)?depression\b/i },
  { scriptId: 'dismiss-looks-fine', pattern: /\byou\s+(?:seem|look)\s+(?:to\s+be\s+)?(?:doing\s+)?(?:fine|well|good|okay|ok|great)\b|\byou(?:'re| are)\s+doing\s+(?:fine|well|great)\b/i },
  { scriptId: 'dismiss-time', pattern: /\bgive it (?:some |more )?time\b|\bwait and see\b|\b(?:your body|you)(?:'ll| will) (?:adjust|get used to it)\b|\bit takes (?:a few weeks|time)\b/i },
  { scriptId: 'side-effect-timing', pattern: /\b(?:not|unlikely to be|probably not)\s+(?:the\s+|your\s+)?(?:medication|medicine|meds|dose)\b/i },
  { scriptId: 'doc-declined', pattern: /\b(?:don'?t|do not|no)\s+need\s+(?:a\s+|an\s+|the\s+|any\s+)?(?:test|tests|referral|scan|blood\s*work)\b|\b(?:won'?t|not going to)\s+(?:order|refer)\b/i },
];

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Fills a playbook line's blanks from the record; blanks it can't fill stay for the person to fill. */
export function fillBlanks(text: string, ctx: CueContext): string {
  const symptom = ctx.priorities.find((p) => !ctx.covered.includes(p)) ?? ctx.priorities[0];
  return text
    .replace('[symptom]', symptom ? lower(clip(symptom, 60)) : '[symptom]')
    .replace('[change]', ctx.latestMedChange ? `the medication change on ${shortDate(ctx.latestMedChange.date)}` : '[change]')
    .replace('[date]', ctx.lastVisitDate ? shortDate(ctx.lastVisitDate) : '[date]');
}

/** True if a talking point seems to have come up in this text (same words, or the same symptom in doctor terms). */
export function mentions(text: string, point: string): boolean {
  if (sameConcern(text, point)) return true;
  const a = new Set(matchSymptoms(point));
  return a.size > 0 && matchSymptoms(text).some((t) => a.has(t));
}

/**
 * @param texts what was said so far, oldest first (finished live pieces, then quick notes)
 */
export function detectCues(texts: readonly string[], ctx: CueContext): CueResult {
  if (hasCrisisLanguage(...texts)) return { cues: [], coveredSuggestions: [] };
  const found: Cue[] = [];
  for (const text of texts) {
    for (const t of TRIGGERS) {
      if (found.some((c) => c.id === t.scriptId) || ctx.dismissed?.includes(t.scriptId)) continue;
      const m = t.pattern.exec(text);
      if (!m) continue;
      const script = SCRIPTS.find((s): s is Script => s.id === t.scriptId);
      if (!script) continue;
      found.push({ id: script.id, heard: clip(text.trim()), situation: script.situation, say: fillBlanks(script.text, ctx) });
    }
  }
  const coveredSuggestions = ctx.priorities.filter((p) => !ctx.covered.includes(p) && texts.some((t) => mentions(t, p)));
  return { cues: found.reverse().slice(0, MAX_CUES), coveredSuggestions };
}
