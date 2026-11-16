/**
 * Case view: patterns across visits, built from the patient's own dated record (board card "Clinically-legible
 * case view", ADR-017). Same engine on the device (My history) and on the server (POST /api/case-summary).
 *
 * What it finds (every item points back to the entries it came from, so nothing is invented):
 *   Patterns (need two or more entries to exist):
 *     timing         a symptom entry began 0–60 days after a medication change
 *     raised-again   the same concern was a talking point at two or more visits
 *     felt-unheard   "felt heard" was 2/5 or lower at two or more visits
 *   Open questions (things still loose):
 *     overdue        a next step whose due date passed with no outcome, or that "didn't happen"
 *     not-covered    a past visit's talking point that never came up (after-visit summary or "covered" ticks)
 *   Highlights: medication changes, the first symptom entry, and past visits, in date order (the last few).
 *
 * Honest about thin records: with fewer than two dated entries `enough` is false and every list is empty,
 * so a new user is never shown made-up patterns. Timing only, never cause: no item says a medicine caused
 * anything, names a condition, or gives advice (the guardrail checks run on every line as a backstop).
 * Free and rule-based. A Claude engine can replace it later behind the same shape.
 */
import { checkOutput } from '../guardrails/checks.js';
import { hasCrisisLanguage } from '../safety.js';
import type { Evidence, FollowUp, Medication, Visit } from '../types.js';

export type CaseRefKind = 'evidence' | 'medication' | 'visit' | 'followUp';
export interface CaseRef { kind: CaseRefKind; id: string }

export interface CasePattern {
  id: string;
  kind: 'timing' | 'raised-again' | 'felt-unheard';
  text: string;
  refs: CaseRef[];
}

export interface CaseOpenQuestion {
  id: string;
  kind: 'overdue' | 'not-covered';
  text: string;
  why: string;
  refs: CaseRef[];
}

export interface CaseHighlight {
  date: string; // YYYY-MM-DD
  text: string;
  ref: CaseRef;
}

export interface CaseView {
  /** False until there are at least MIN_ENTRIES dated entries. Lists are then empty. */
  enough: boolean;
  /** Dated entries counted (timeline entries + past visits + medicines not already on the timeline). */
  entries: number;
  patterns: CasePattern[];
  openQuestions: CaseOpenQuestion[];
  highlights: CaseHighlight[];
  /** Shown with any pattern: dates show timing, not cause. */
  note: string;
}

export type CaseViewResult = { status: 'ok'; view: CaseView } | { status: 'crisis' };

/** Only the parts of the record the engine reads (so the server can accept a slim copy). */
export interface CaseInputs {
  medications: readonly Pick<Medication, 'id' | 'name' | 'dose' | 'started' | 'note'>[];
  evidence: readonly Evidence[];
  visits: readonly (Pick<Visit, 'id' | 'date' | 'clinician' | 'priorities' | 'covered'> & {
    checkIn?: Pick<NonNullable<Visit['checkIn']>, 'feltHeard'>;
    /** Only the after-visit summary's talking points are read. */
    afterVisit?: { talkingPoints: readonly { text: string; raised: boolean }[] };
  })[];
  followUps: readonly Pick<FollowUp, 'id' | 'step' | 'dueDate' | 'outcome'>[];
}

export const MIN_ENTRIES = 2;
export const MAX_PATTERNS = 5;
export const MAX_OPEN_QUESTIONS = 5;
export const MAX_HIGHLIGHTS = 6;
/** How long after a medication change a new symptom still counts as "after the change". */
export const TIMING_WINDOW_DAYS = 60;
export const CASE_NOTE = 'These come from the dates in your own record. They show timing, not cause. Your doctor can help explain what they mean.';

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const STOP = new Set(['what', 'that', 'this', 'with', 'could', 'would', 'about', 'when', 'have', 'from', 'time', 'today', 'last', 'since', 'they', 'them', 'there', 'were', 'been', 'into', 'just', 'like', 'more', 'very']);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
/** "Story saved" entries repeat the story; they are not a new symptom starting. */
const isStoryEntry = (e: Evidence) => /^story saved$/i.test(e.title.trim());
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Two talking points are "the same concern" when they share at least two content words and half of the shorter one. */
export function sameConcern(a: string, b: string): boolean {
  const aw = words(a);
  const bw = words(b);
  const shared = [...aw].filter((w) => bw.has(w)).length;
  return shared >= 2 && shared / Math.min(aw.size, bw.size || 1) >= 0.5;
}

interface MedChange { date: string; label: string; ref: CaseRef }

/** Medication changes from the timeline, plus medicines whose start date isn't on the timeline yet. */
function medicationChanges(input: CaseInputs): MedChange[] {
  const fromTimeline = input.evidence.filter((e) => e.type === 'medication').map((e) => ({ date: e.date, label: e.detail || e.title, ref: { kind: 'evidence', id: e.id } as CaseRef }));
  const fromList = input.medications
    .filter((m) => !fromTimeline.some((t) => t.date === m.started && t.label.toLowerCase().includes(m.name.toLowerCase())))
    .map((m) => ({ date: m.started, label: [m.name, m.dose].filter(Boolean).join(' '), ref: { kind: 'medication', id: m.id } as CaseRef }));
  return [...fromTimeline, ...fromList].sort((a, b) => a.date.localeCompare(b.date));
}

function patientText(input: CaseInputs): string[] {
  return [
    ...input.evidence.flatMap((e) => [e.title, e.detail]),
    ...input.medications.flatMap((m) => [m.name, m.dose, m.note ?? '']),
    ...input.visits.flatMap((v) => [v.clinician ?? '', ...v.priorities, ...(v.covered ?? [])]),
    ...input.followUps.map((f) => f.step),
  ];
}

export function buildCaseView(input: CaseInputs, today: string): CaseViewResult {
  const texts = patientText(input);
  if (hasCrisisLanguage(...texts)) return { status: 'crisis' };

  const pastVisits = input.visits.filter((v) => v.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const meds = medicationChanges(input);
  const pastEvidence = input.evidence.filter((e) => e.date <= today);
  const entries = pastEvidence.length + pastVisits.length + meds.filter((m) => m.ref.kind === 'medication' && m.date <= today).length;
  const empty: CaseView = { enough: false, entries, patterns: [], openQuestions: [], highlights: [], note: CASE_NOTE };
  if (entries < MIN_ENTRIES) return { status: 'ok', view: empty };

  const patterns: CasePattern[] = [];
  const symptoms = pastEvidence.filter((e) => e.type === 'symptom' && !isStoryEntry(e)).sort((a, b) => a.date.localeCompare(b.date));

  // Timing: the first symptom entry on or after each medication change, within the window.
  for (const m of meds) {
    const s = symptoms.find((x) => x.date >= m.date && daysApart(m.date, x.date) <= TIMING_WINDOW_DAYS);
    if (!s || patterns.some((p) => p.refs.some((r) => r.id === s.id))) continue;
    const n = daysApart(m.date, s.date);
    const when = n === 0 ? 'the same day as' : `${plural(n, 'day')} after`;
    patterns.push({
      id: `timing-${s.id}`,
      kind: 'timing',
      text: `${shortDate(s.date)}: "${clip(s.detail || s.title)}". That was ${when} a medication change ("${clip(m.label, 60)}", ${shortDate(m.date)}).`,
      refs: [m.ref, { kind: 'evidence', id: s.id }],
    });
  }

  // Raised again: the same talking point at two or more visits (past or upcoming).
  const byDate = [...input.visits].sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();
  for (const v of byDate) {
    for (const p of v.priorities) {
      const key = `${v.id}:${p}`;
      if (used.has(key)) continue;
      const repeats = byDate.filter((o) => o.id !== v.id && o.priorities.some((q) => sameConcern(p, q)));
      if (!repeats.length) continue;
      used.add(key);
      for (const o of repeats) o.priorities.filter((q) => sameConcern(p, q)).forEach((q) => used.add(`${o.id}:${q}`));
      const all = [v, ...repeats];
      patterns.push({
        id: `raised-${v.id}-${patterns.length}`,
        kind: 'raised-again',
        text: `You've brought up "${clip(p)}" at ${plural(all.length, 'visit')} (${all.map((x) => shortDate(x.date)).join(', ')}).`,
        refs: all.map((x) => ({ kind: 'visit', id: x.id })),
      });
    }
  }

  // Felt unheard more than once.
  const unheard = pastVisits.filter((v) => v.checkIn && v.checkIn.feltHeard <= 2);
  if (unheard.length >= 2) {
    patterns.push({
      id: 'felt-unheard',
      kind: 'felt-unheard',
      text: `You felt heard 2 out of 5 or less at ${plural(unheard.length, 'visit')} (${unheard.map((v) => shortDate(v.date)).join(', ')}).`,
      refs: unheard.map((v) => ({ kind: 'visit', id: v.id })),
    });
  }

  // Open questions.
  const open: CaseOpenQuestion[] = [];
  for (const f of [...input.followUps].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const missed = f.outcome === 'Didn’t happen';
    const overdue = !f.outcome && f.dueDate < today;
    if (!missed && !overdue) continue;
    open.push({
      id: `overdue-${f.id}`,
      kind: 'overdue',
      text: `"${clip(f.step, 60)}": what happens next?`,
      why: missed ? `You logged that it didn't happen (it was due ${shortDate(f.dueDate)}).` : `It was due ${shortDate(f.dueDate)} and isn't marked done.`,
      refs: [{ kind: 'followUp', id: f.id }],
    });
  }
  const lastVisit = pastVisits.at(-1);
  if (lastVisit) {
    const missedPoints = lastVisit.afterVisit
      ? lastVisit.afterVisit.talkingPoints.filter((p) => !p.raised).map((p) => p.text)
      : lastVisit.covered
        ? lastVisit.priorities.filter((p) => !lastVisit.covered!.includes(p))
        : [];
    for (const p of missedPoints) {
      open.push({
        id: `not-covered-${lastVisit.id}-${open.length}`,
        kind: 'not-covered',
        text: `"${clip(p)}" didn't come up yet.`,
        why: `It was a talking point for your visit on ${shortDate(lastVisit.date)}.`,
        refs: [{ kind: 'visit', id: lastVisit.id }],
      });
    }
  }

  // Highlights: medication changes, the first symptom, past visits. Keep the most recent few, oldest first.
  const highlights: CaseHighlight[] = [
    ...meds.filter((m) => m.date <= today).map((m) => ({ date: m.date, text: `Medication change: ${clip(m.label, 60)}`, ref: m.ref })),
    ...(symptoms[0] ? [{ date: symptoms[0].date, text: `First symptom noted: ${clip(symptoms[0].detail || symptoms[0].title, 70)}`, ref: { kind: 'evidence', id: symptoms[0].id } as CaseRef }] : []),
    ...pastVisits.map((v) => ({
      date: v.date,
      text: `Visit${v.clinician ? ` with ${v.clinician}` : ''}${v.checkIn ? ` · felt heard ${v.checkIn.feltHeard}/5` : ''}`,
      ref: { kind: 'visit', id: v.id } as CaseRef,
    })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_HIGHLIGHTS);

  // Backstop: drop any line that breaks a guardrail rule (no diagnosis, no advice, no new medicine names).
  const input_ = texts.join('\n');
  const safe = (line: string) => checkOutput(line, { input: input_ }).ok;

  return {
    status: 'ok',
    view: {
      enough: true,
      entries,
      patterns: patterns.filter((p) => safe(p.text)).slice(0, MAX_PATTERNS),
      openQuestions: open.filter((q) => safe(q.text) && safe(q.why)).slice(0, MAX_OPEN_QUESTIONS),
      highlights: highlights.filter((h) => safe(h.text)),
      note: CASE_NOTE,
    },
  };
}
