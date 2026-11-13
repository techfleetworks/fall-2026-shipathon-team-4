/**
 * Suggested questions for the next visit, from the patient's goal and history (board card, ADR-012).
 *
 * Every question is grounded in something already in the patient's own record, and says why ("why" is shown
 * or available to the screen):
 *   A. Not covered last time  (after-visit summary, ADR-011)  → "Last time we did not talk about …"
 *   B. Timing                 (timeline: medicine changed, then symptoms began) → "Could the medicine be causing it?"
 *   C. Options                (when B applies)                → lower dose / different medicine / other time
 *   D. Put down to something  (last visit: "from the depression") → "If this is not the depression, what else could it be?"
 *   E. Follow-up plan         (last visit: "check again next month") → "If it is not better by then, what will we try next?"
 * Free and rule-based. Questions for the clinician, never advice: they never name a medicine, a dose or a
 * condition the patient didn't already raise. About a 6th-grade reading level (tested). Nothing is invented.
 */
import { REVERSE_PAIRS, type ReversePair } from '../afterVisit/reversePairs.js';
import { hasCrisisLanguage } from '../safety.js';
import type { CaseSummary, Evidence, FollowUp, Visit } from '../types.js';

export interface SuggestedQuestion {
  id: string;
  text: string;
  /** Plain reason, from the patient's own record. */
  why: string;
}

export interface QuestionInputs {
  visits: readonly Visit[];
  evidence: readonly Evidence[];
  summaries: readonly CaseSummary[];
  followUps?: readonly FollowUp[];
}

export const MAX_SUGGESTIONS = 5;

/** "feeling dizzy when you stand up" → "feeling dizzy when I stand up" (the patient asks in their own voice). */
export function firstPerson(plain: string): string {
  return plain.replace(/\byourself\b/g, 'myself').replace(/\byour\b/g, 'my').replace(/\byou\b/g, 'I');
}

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !['what', 'that', 'this', 'with', 'could', 'would', 'about', 'when', 'have', 'from', 'time', 'today', 'last'].includes(w)));

/** True if `q` mostly repeats a talking point the patient already has. */
function alreadyAsked(q: string, priorities: readonly string[]): boolean {
  const qw = words(q);
  return priorities.some((p) => {
    const pw = words(p);
    const shared = [...qw].filter((w) => pw.has(w)).length;
    return shared >= 2 && shared / Math.min(qw.size, pw.size || 1) >= 0.4;
  });
}

/** The most recent visit before `visit` (or before today). */
function lastVisitBefore(visits: readonly Visit[], visit: Visit | undefined, today: string): Visit | undefined {
  const cutoff = visit && visit.date <= today ? visit.date : today;
  return [...visits].filter((v) => v.date < cutoff && v.id !== visit?.id).sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function suggestQuestions(input: QuestionInputs, visit: Visit | undefined, today: string): SuggestedQuestion[] {
  const out: SuggestedQuestion[] = [];
  const last = lastVisitBefore(input.visits, visit, today);
  const after = last?.afterVisit;
  const lastWhen = last ? shortDate(last.date) : '';

  // A. Raised last time, never talked about (the after-visit summary's "not covered" lines).
  const uncovered: ReversePair[] = after
    ? REVERSE_PAIRS.filter((p) => after.notCovered.some((line) => line.includes(p.plain)))
    : [];
  for (const p of uncovered) {
    out.push({ id: `uncovered-${p.id}`, text: `Last time we did not talk about ${firstPerson(p.plain)}. Can we talk about it today?`, why: `Not covered at your visit on ${lastWhen}.` });
    if (p.id === 'orthostatic') {
      out.push({ id: 'standing-bp', text: 'Could my blood pressure be dropping when I stand up?', why: `You get dizzy when you stand, and it was not checked on ${lastWhen}.` });
    }
  }

  // B + C. The timeline shows the medicine changed shortly before the symptoms began.
  const sorted = [...input.evidence].sort((a, b) => a.date.localeCompare(b.date));
  const medChange = sorted.filter((e) => e.type === 'medication').at(-1);
  const symptomStart = medChange && sorted.find((e) => e.type === 'symptom' && e.date >= medChange.date && daysApart(medChange.date, e.date) <= 60);
  const storyTiming = input.summaries.some((s) => s.fields.some((f) => f.key === 'onset' && /after a medication change/i.test(f.clinical)));
  const raisedTiming = !!after?.youRaised.some((l) => /after the medicine dose changed/i.test(l));
  if (symptomStart || storyTiming || raisedTiming) {
    out.push({
      id: 'medicine-cause',
      text: 'This started right after my medicine changed. Could the medicine be causing it?',
      why: symptomStart ? `Your timeline: medicine changed ${shortDate(medChange!.date)}, symptoms began ${shortDate(symptomStart.date)}.` : 'You said it started after a medicine change.',
    });
    out.push({ id: 'options', text: 'What are my choices? A lower dose, a new medicine, or a new time to take it?', why: 'So you leave with choices, not just "give it time".' });
  }

  // D. Last time it was put down to something.
  const putDown =
    after?.doctorSaid.map((l) => /from the (depression|anxiety|stress|mood)\b/i.exec(l)?.[1]).find(Boolean) ??
    input.evidence.map((e) => /attributed to (depression|anxiety|stress)/i.exec(e.detail)?.[1]).find(Boolean);
  if (putDown) {
    out.push({ id: 'what-else', text: `If this is not the ${putDown.toLowerCase()}, what else could it be?`, why: `At your last visit it was put down to the ${putDown.toLowerCase()}.` });
  }

  // E. The plan from last time.
  const planned = after?.plan.find((l) => /^Check again/i.test(l)) ?? (input.followUps?.some((f) => f.visitId === last?.id) ? 'Check again.' : undefined);
  if (planned) {
    out.push({ id: 'if-not-better', text: 'If it is not better by then, what will we try next?', why: `Plan from your last visit: ${planned.replace(/\.$/, '').toLowerCase()}.` });
  }

  const priorities = visit?.priorities ?? [];
  return out
    .filter((q, i, all) => all.findIndex((x) => x.id === q.id) === i)
    .filter((q) => !alreadyAsked(q.text, priorities))
    .filter((q) => !hasCrisisLanguage(q.text))
    .slice(0, MAX_SUGGESTIONS);
}
