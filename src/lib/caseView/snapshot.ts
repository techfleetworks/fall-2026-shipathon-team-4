/**
 * The shareable record (ADR-020): freezes the clinically legible case (ADR-017) into a shared brief, so a doctor sees the
 * history in doctor terms, as it was when the patient made the link. Only clinical lines and dates: no entry ids,
 * no plain-language "you" lines, nothing the case view didn't already check.
 * Returns undefined when there isn't enough history to show a case (the brief is shared without it) or on crisis language.
 */
import type { CaseSnapshot } from '../types.js';
import { buildCaseView, type CaseInputs } from './caseView.js';

export const MAX_SNAPSHOT_VISITS = 10;

export function buildCaseSnapshot(record: CaseInputs, today: string): CaseSnapshot | undefined {
  const out = buildCaseView(record, today);
  if (out.status !== 'ok' || !out.view.enough) return undefined;
  const v = out.view;
  const visits = [...record.visits]
    .filter((x) => x.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOT_VISITS)
    .map((x) => ({ date: x.date, ...(x.clinician ? { clinician: x.clinician } : {}), ...(x.checkIn?.feltHeard ? { feltHeard: x.checkIn.feltHeard } : {}) }));
  return {
    presenting: v.clinical.presenting,
    course: v.clinical.course,
    medications: v.clinical.medications,
    patterns: v.patterns.map((p) => p.clinical),
    openItems: v.openQuestions.map((q) => q.clinical),
    keyDates: v.highlights.map((h) => ({ date: h.date, text: h.clinical })),
    visits,
  };
}
