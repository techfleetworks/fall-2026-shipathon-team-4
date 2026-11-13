/**
 * Action items from the visit (board card "Extract action items", ADR-013). Pulled only from what the
 * after-visit summary (ADR-011) found in the transcript or notes, never invented:
 *   1. The follow-up the clinician set ("we'll reassess next month")  → "Book a follow-up visit with Dr. Lane"
 *      (skipped when a visit with them is already on the calendar around then)
 *   2. What the clinician said they'd do ("let us run a thyroid panel") → owned by the clinician / clinic
 *   3. What wasn't covered, and talking points that never came up       → "Ask about …" at the next visit
 * Shaped like the app's FollowUp, so Diana's Next steps screen lists them (who, by when, Remind me / Add visit).
 */
import { checkOutput } from '../guardrails/index.js';
import type { FollowUp, Visit } from '../types.js';
import type { AfterVisitSummary } from './summary.js';

export interface ActionItem {
  step: string;
  owner: string;
  dueDate: string;
  isVisit: boolean;
  /** Where it came from, in plain words. */
  why: string;
}

export interface ActionContext {
  /** The visit the summary is about (YYYY-MM-DD). */
  visitDate: string;
  clinician?: string;
  /** Visits already on the calendar (to avoid "book a follow-up" when one is booked). */
  upcomingVisits?: readonly Pick<Visit, 'date' | 'clinician'>[];
  /** Follow-ups already saved for this visit (to avoid repeats). */
  existing?: readonly Pick<FollowUp, 'step' | 'dueDate' | 'isVisit'>[];
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysApart = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000));
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const NUM: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, six: 6, 'a few': 3 };

/** "Check again next month." → days until then (undefined: no time given). */
export function followUpDays(planLine: string): number | undefined {
  const m = /next (week|month)|in (\d+|a few|one|two|three|four|six) (days?|weeks?|months?)/i.exec(planLine);
  if (!m) return undefined;
  if (m[1]) return m[1].toLowerCase() === 'week' ? 7 : 30;
  const n = Number(m[2]) || NUM[m[2].toLowerCase()] || 1;
  const unit = m[3].toLowerCase();
  return n * (unit.startsWith('day') ? 1 : unit.startsWith('week') ? 7 : 30);
}

export function extractActionItems(summary: AfterVisitSummary, ctx: ActionContext): ActionItem[] {
  const items: ActionItem[] = [];
  const when = shortDate(ctx.visitDate);
  const sameClinician = (v: Pick<Visit, 'clinician'>) => !ctx.clinician || !v.clinician || v.clinician === ctx.clinician;

  // 1. Follow-up visit.
  const planLine = summary.plan.find((l) => /^Check again/i.test(l));
  const days = planLine ? followUpDays(planLine) : undefined;
  const due = days !== undefined ? addDays(ctx.visitDate, days) : undefined;
  const booked =
    (ctx.upcomingVisits ?? []).filter((v) => v.date > ctx.visitDate && sameClinician(v)).sort((a, b) => a.date.localeCompare(b.date))
      .find((v) => !due || daysApart(v.date, due) <= 14);
  if (planLine && !booked) {
    items.push({
      step: `Book a follow-up visit${ctx.clinician ? ` with ${ctx.clinician}` : ''}`,
      owner: 'You',
      dueDate: due ?? addDays(ctx.visitDate, 28),
      isVisit: true,
      why: `Plan from your visit on ${when}: ${planLine.replace(/\.$/, '').toLowerCase()}.`,
    });
  }
  const nextVisitDate = booked?.date ?? due ?? addDays(ctx.visitDate, 28);

  // 2. What the clinician said they or the clinic would do.
  for (const task of summary.promised) {
    items.push({ step: task, owner: ctx.clinician ?? 'The clinic', dueDate: addDays(ctx.visitDate, 14), isVisit: false, why: `The doctor said they would do this on ${when}.` });
  }

  // 3. Raise again what wasn't covered.
  for (const line of summary.notCovered) {
    const topic = /^The doctor did not talk about (.+)\.$/.exec(line)?.[1] ?? /^This talking point (?:did not come up|is not in your notes): (.+)\.$/.exec(line)?.[1];
    if (topic) items.push({ step: `Ask about ${topic}`, owner: 'You', dueDate: nextVisitDate, isVisit: false, why: `Not covered at your visit on ${when}.` });
  }

  const have = new Set((ctx.existing ?? []).map((f) => f.step.trim().toLowerCase()));
  return items
    .filter((it, i, all) => all.findIndex((x) => x.step.toLowerCase() === it.step.toLowerCase()) === i)
    .filter((it) => !have.has(it.step.toLowerCase()))
    .filter((it) => checkOutput(it.step, { input: [...summary.promised, ...summary.notCovered].join('\n') }).ok);
}
