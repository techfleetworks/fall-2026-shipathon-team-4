import { describe, expect, it } from 'vitest';
import { selectVisitSummary } from './store';
import type { CaseSummary } from './types';

const summary = (createdAt: string) => ({ id: 's1', createdAt, opening: 'Low mood', fields: [] }) as unknown as CaseSummary;

describe('selectVisitSummary', () => {
  it('ignores a story saved before the visit was added', () => {
    const s = { summaries: [summary('2026-11-01T10:00:00.000Z')] };
    expect(selectVisitSummary(s, { createdAt: '2026-11-18T09:00:00.000Z' })).toBeUndefined();
  });

  it('counts a story saved after the visit was added', () => {
    const s = { summaries: [summary('2026-11-18T10:00:00.000Z')] };
    expect(selectVisitSummary(s, { createdAt: '2026-11-18T09:00:00.000Z' })?.id).toBe('s1');
  });

  it('keeps older visits (no createdAt) working with any story', () => {
    const s = { summaries: [summary('2026-11-01T10:00:00.000Z')] };
    expect(selectVisitSummary(s, {})?.id).toBe('s1');
  });
});
