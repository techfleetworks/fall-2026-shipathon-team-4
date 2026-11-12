/**
 * Plain → clinical mapping pipeline (ADR-006). One entry point for /api/prep-summary:
 *
 *   1. crisis check on the whole story        → crisis path; NO engine runs, nothing is sent anywhere
 *   2. rules engine (free, always on)          → the summary every patient gets today
 *   3. optional AI mapper (only if configured) → approved terms + exact quotes, with a deadline
 *   4. contract check (contract.ts)            → wrong term / invented quote / bad shape → rules only
 *   5. guardrails (guardResponse)              → any rule broken → rules only
 *
 * The AI can only ADD approved terms the rules missed; it can't remove or reword anything.
 * Every failure is a quiet fallback to the rules answer, never an error for the patient.
 */
import { translateStoryGuarded, type GuardedSummary } from '../../src/lib/engine.js';
import { storyDraftHasCrisis } from '../../src/lib/guardrails/enforce.js';
import { matchSymptoms, translateStory } from '../../src/lib/translate.js';
import type { StoryDraft, SummaryField } from '../../src/lib/types.js';
import { orderTerms, storyTextForMapping, validateMapping, type SymptomMapping } from './contract.js';
import { MapperError, type EngineName, type FallbackReason, type MappingEngine } from './types.js';

export type MappingResult = GuardedSummary & {
  /** Which engine's answer is shown. */
  engine: EngineName;
  /** Set when the AI was asked but its answer was not used. */
  fallback?: FallbackReason;
};

export const RULES_ENGINE: MappingEngine = { name: 'rules', timeoutMs: 0 };

/** Rules fields with the Symptoms line widened to the rules' terms plus the AI's validated terms. */
export function fieldsWithMapping(d: StoryDraft, mapping: SymptomMapping): SummaryField[] {
  const storyText = storyTextForMapping(d);
  const terms = orderTerms([...matchSymptoms(storyText), ...mapping.symptoms.map((s) => s.term)]);
  return translateStory(d).map((f) => {
    if (f.key !== 'symptoms') return f;
    const quote = d.opening.trim() || mapping.symptoms.map((s) => s.quote).join(' · ') || undefined;
    return { ...f, clinical: terms.length ? terms.join('; ') : 'Not discussed', quote };
  });
}

function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new MapperError('timeout'));
    }, ms);
  });
  return Promise.race([work(controller.signal), deadline]).finally(() => clearTimeout(timer));
}

/** Logs the reason only (never story text, quotes or terms), so failures can be counted. */
function noteFallback(reason: FallbackReason, detail?: string): void {
  console.warn(`[mapping] AI answer not used: ${reason}${detail ? ` (${detail})` : ''}; rules engine answered`);
}

export async function runMapping(d: StoryDraft, engine: MappingEngine = RULES_ENGINE): Promise<MappingResult> {
  // 1. Crisis first, before any engine and before anything could leave the server.
  if (storyDraftHasCrisis(d)) return { status: 'crisis', engine: engine.name };

  const rules = (fallback?: FallbackReason): MappingResult => ({
    ...translateStoryGuarded(d),
    engine: 'rules',
    ...(fallback ? { fallback } : {}),
  });

  const storyText = storyTextForMapping(d);
  if (!engine.mapper || !storyText) return rules();

  // 3. Ask the AI mapper, with a deadline.
  let raw: unknown;
  try {
    raw = await withDeadline((signal) => engine.mapper!.map(storyText, signal), engine.timeoutMs);
  } catch (err) {
    const reason = err instanceof MapperError ? err.reason : 'error';
    noteFallback(reason, err instanceof MapperError ? err.detail : undefined);
    return rules(reason);
  }

  // 4. Contract check.
  const checked = validateMapping(raw, storyText);
  if (!checked.ok) {
    noteFallback('invalid-output', checked.reason);
    return rules('invalid-output');
  }
  // The model saw crisis language our word list missed: take the safe path.
  if (checked.mapping.crisisLanguage) return { status: 'crisis', engine: engine.name };

  // 5. Guardrails on the final text.
  const guarded = translateStoryGuarded(d, (draft) => fieldsWithMapping(draft, checked.mapping));
  if (guarded.status === 'blocked') {
    noteFallback('guardrail', [...new Set(guarded.violations.map((v) => v.rule))].join(','));
    return rules('guardrail');
  }
  return { ...guarded, engine: engine.name };
}
