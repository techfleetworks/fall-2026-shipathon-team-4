/**
 * Labs + clinical note in one go (board card "Plain-language explainer on labs & notes", ADR-008).
 * Crisis anywhere → crisis path for the whole request; any part blocked → the whole answer is blocked
 * (the honest fallback), so a patient never sees half an answer.
 */
import { explainClinical, type Explanation } from '../explain/explain.js';
import type { Violation } from '../guardrails/index.js';
import { explainLabs, type LabExplanation, type LabRow } from './labs.js';

export type ResultsOutcome =
  | { status: 'crisis' }
  | { status: 'blocked'; message: string; violations: Violation[] }
  | { status: 'ok'; labs: LabExplanation[]; note: Explanation[] };

export function explainResults({ labs = [], note = '' }: { labs?: readonly LabRow[]; note?: string }): ResultsOutcome {
  const labsOut = explainLabs(labs);
  const noteOut: ReturnType<typeof explainClinical> = note.trim() ? explainClinical(note) : { status: 'ok', explanations: [] };

  if (labsOut.status === 'crisis' || noteOut.status === 'crisis') return { status: 'crisis' };
  if (labsOut.status === 'blocked') return labsOut;
  if (noteOut.status === 'blocked') return noteOut;
  return { status: 'ok', labs: labsOut.labs, note: noteOut.explanations };
}
