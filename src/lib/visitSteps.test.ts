import { describe, expect, it } from 'vitest';
import { selectVisitSummary } from './store';
import type { CaseSummary } from './types';

const summary = (id: string, createdAt: string, visitId?: string) =>
  ({ id, createdAt, opening: 'Low mood', fields: [], visitId }) as unknown as CaseSummary;
const A = { id: 'a', createdAt: '2026-11-18T09:00:00.000Z' };
const B = { id: 'b', createdAt: '2026-11-19T09:00:00.000Z' };
const OLD = { id: 'old' }; // made before visits had createdAt

describe('selectVisitSummary', () => {
  it('a new visit starts empty, even when other stories exist', () => {
    const s = { summaries: [summary('s1', '2026-11-18T10:00:00.000Z', 'a')], visits: [A, B] };
    expect(selectVisitSummary(s, B)).toBeUndefined();
  });

  it('a story saved for one visit never shows on another', () => {
    const s = { summaries: [summary('s1', '2026-11-18T10:00:00.000Z', 'a'), summary('s2', '2026-11-19T10:00:00.000Z', 'b')], visits: [A, B] };
    expect(selectVisitSummary(s, A)?.id).toBe('s1');
    expect(selectVisitSummary(s, B)?.id).toBe('s2');
  });

  it('an older story without a visit belongs to the visit added just before it', () => {
    const s = { summaries: [summary('s1', '2026-11-19T10:00:00.000Z')], visits: [A, B] };
    expect(selectVisitSummary(s, B)?.id).toBe('s1');
    expect(selectVisitSummary(s, A)).toBeUndefined();
  });

  it('older visits keep stories that belong to no newer visit', () => {
    const s = { summaries: [summary('s0', '2026-11-01T10:00:00.000Z'), summary('s1', '2026-11-18T10:00:00.000Z', 'a')], visits: [OLD, A] };
    expect(selectVisitSummary(s, OLD)?.id).toBe('s0');
  });
});
