/**
 * The "See it in doctor terms" engine with the guardrails wired in (ticket B1).
 * Every engine output goes through guardResponse() before the patient sees it:
 *   crisis in the story or output → crisis path (nothing is built)
 *   output breaks a rule          → blocked, the honest fallback is shown instead
 *   otherwise                     → the fields are shown
 * The engine is a parameter so the future Claude engine (or a test double) gets the same checks.
 */
import { guardResponse, storyDraftHasCrisis, type Violation } from './guardrails/index.js';
import { TRANSLATION_PAIRS, translateStory } from './translate.js';
import type { StoryDraft, SummaryField } from './types.js';

/** The approved clinical vocabulary (from translation_pairs.csv, via translate.ts). */
export const ENGINE_VOCABULARY: readonly string[] = TRANSLATION_PAIRS.map((p) => p.clinical);

export type GuardedSummary =
  | { status: 'crisis' }
  | { status: 'blocked'; message: string; violations: Violation[] }
  | { status: 'ok'; fields: SummaryField[] };

/** Everything the patient wrote or picked, as one text: what the engine may echo back. */
export function storyInputText(d: StoryDraft): string {
  return [
    d.opening,
    d.onset.choice, d.onset.text,
    d.frequency.choice, d.frequency.text,
    d.severity.score !== undefined ? `${d.severity.score}/10` : '', ...d.severity.impacts, d.severity.text,
    ...d.triggers.choices, d.triggers.text,
    ...d.tried.choices, d.tried.medName, d.tried.medDose, d.tried.medDuration, d.tried.outcome, d.tried.text,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Whatever is left of the Symptoms line after removing every approved term and the "; " separators.
 * Empty means every symptom term came from the approved vocabulary (rule: never invent a clinical term).
 * Done this way because some approved terms contain ";" themselves.
 */
function unapprovedSymptomText(symptoms: string): string {
  if (symptoms === 'Not discussed') return '';
  let rest = symptoms;
  for (const term of [...ENGINE_VOCABULARY].sort((a, b) => b.length - a.length)) rest = rest.split(term).join('');
  return rest.replace(/[;\s]+/g, ' ').trim();
}

export function translateStoryGuarded(d: StoryDraft, engine: (d: StoryDraft) => SummaryField[] = translateStory): GuardedSummary {
  if (storyDraftHasCrisis(d)) return { status: 'crisis' };
  const fields = engine(d);
  const output = fields.map((f) => f.clinical).join('\n');
  const leftover = unapprovedSymptomText(fields.find((f) => f.key === 'symptoms')?.clinical ?? 'Not discussed');

  const result = guardResponse(output, {
    input: storyInputText(d),
    approvedVocabulary: ENGINE_VOCABULARY,
    clinicalTerms: leftover ? [leftover] : [],
  });
  if (result.status === 'ok') return { status: 'ok', fields };
  return result;
}
