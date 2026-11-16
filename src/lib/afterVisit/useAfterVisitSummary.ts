/**
 * After-visit summary + action items for REAL users' visits (ADR-011, ADR-013). Their source is the visit's
 * quick notes (typed, or spoken with the At-the-visit live capture). When the patient opens After for a visit
 * that has happened and has notes, the server summarizes them (POST /api/notes-summary), and the app saves:
 *   - visit.afterVisit (the full summary), marked with which notes it came from (re-runs only if they change)
 *   - visit.recap in plain words, only if there's no recap yet (a recap the patient fixed is never overwritten)
 *   - visit.covered: talking points that came up are ticked (never unticked)
 *   - Next steps: the action items, without repeating ones already there
 * Theo's demo visit already has its summary from his transcript, so nothing runs for it.
 */
import { useEffect } from 'react';
import { requestNotesSummary } from '../api';
import { todayISO } from '../dates';
import { useApp } from '../store';
import type { FollowUp, Visit } from '../types';
import { extractActionItems } from './actionItems';
import type { AfterVisitSummary } from './summary';

/** A short fingerprint of the notes + talking points (not stored anywhere else, never sent). */
export function notesKey(notes: string, talkingPoints: readonly string[]): string {
  let h = 5381;
  for (const ch of `${notes.trim()}\u0000${talkingPoints.join('\u0000')}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** Should this visit's notes be summarized now? */
export function needsSummary(visit: Visit | null | undefined, today: string): boolean {
  if (!visit || visit.date > today) return false;
  const notes = visit.notes?.trim() ?? '';
  if (notes.length < 3) return false;
  if (visit.recap?.source === 'transcript' || visit.recap?.source === 'recording') return false;
  return visit.afterVisit?.basedOn !== notesKey(notes, visit.priorities);
}

export interface AfterVisitUpdate {
  visitPatch: Partial<Visit>;
  newFollowUps: Omit<FollowUp, 'id'>[];
}

/** What to save, given the server's summary. Pure, so it's tested without React. */
export function planAfterVisitUpdate(
  visit: Visit,
  summary: AfterVisitSummary,
  ctx: { visits: readonly Visit[]; followUps: readonly FollowUp[]; now?: string },
): AfterVisitUpdate {
  const basedOn = notesKey(visit.notes ?? '', visit.priorities);
  const raised = summary.talkingPoints.filter((p) => p.raised).map((p) => p.text);
  const visitPatch: Partial<Visit> = {
    afterVisit: { ...summary, basedOn },
    covered: [...new Set([...(visit.covered ?? []), ...raised])],
  };
  if (!visit.recap?.doctorSaid.length) {
    const doctorSaid = summary.doctorSaid.map((l) => l.replace(/^Your notes:\s*/, ''));
    if (doctorSaid.length) visitPatch.recap = { doctorSaid, source: 'notes', updatedAt: ctx.now ?? new Date().toISOString() };
  }
  const items = extractActionItems(summary, {
    visitDate: visit.date,
    clinician: visit.clinician,
    upcomingVisits: ctx.visits,
    existing: ctx.followUps.filter((f) => f.visitId === visit.id),
  });
  return {
    visitPatch,
    newFollowUps: items.map((it) => ({ visitId: visit.id, step: it.step, owner: it.owner, dueDate: it.dueDate, isVisit: it.isVisit, reminder: true })),
  };
}

/** Runs the summary for this visit when needed. Call it at the top of the After screens. */
export function useAfterVisitSummary(visit: Visit | null | undefined): void {
  const key = visit ? notesKey(visit.notes ?? '', visit.priorities) : '';
  const due = needsSummary(visit, todayISO());
  useEffect(() => {
    if (!visit || !due) return;
    const controller = new AbortController();
    void requestNotesSummary(visit.notes ?? '', visit.priorities, { signal: controller.signal }).then((r) => {
      if (controller.signal.aborted || r.status !== 'ok') return; // crisis is handled where the notes are typed
      const state = useApp.getState();
      const current = state.visits.find((v) => v.id === visit.id);
      if (!current || notesKey(current.notes ?? '', current.priorities) !== key) return; // notes changed meanwhile
      const { visitPatch, newFollowUps } = planAfterVisitUpdate(current, r.summary, { visits: state.visits, followUps: state.followUps });
      state.updateVisit(current.id, visitPatch);
      for (const f of newFollowUps) state.addFollowUp(f);
    });
    return () => controller.abort();
    // Re-run only when this visit or its notes / talking points change.
  }, [visit?.id, key, due]); // eslint-disable-line react-hooks/exhaustive-deps
}
