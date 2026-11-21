import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../lib/store';
import type { CaseSummary, Visit } from '../../lib/types';

let beforeSteps: (s: AppData, v: Visit) => { done: boolean }[];
beforeAll(async () => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  ({ beforeSteps } = await import('./common'));
});

const story = { id: 's', createdAt: '2026-11-20T10:00:00.000Z', opening: 'Low mood', fields: [], visitId: 'v' } as unknown as CaseSummary;
const visit = (p: Partial<Visit>) => ({ id: 'v', date: '2026-12-11', createdAt: '2026-11-19T00:00:00.000Z', priorities: [], askingFor: [], ...p }) as Visit;
const ticks = (v: Visit, summaries: CaseSummary[] = [story]) =>
  beforeSteps({ summaries, visits: [v] } as unknown as AppData, v).map((s) => s.done);

describe('Before-the-visit ticks', () => {
  it('nothing is ticked just for having answers', () => {
    expect(ticks(visit({ stepsDone: [], priorities: ['a'], prep: { checks: ['x'], extra: [] }, shared: true }))).toEqual([false, false, false, false, false]);
  });
  it('Notes for your doctor ticks once opened, even when empty', () => {
    expect(ticks(visit({ stepsDone: ['summary'] }), [])[1]).toBe(true);
  });
  it('a step ticks after Continue only while its answer is still there', () => {
    const v = visit({ stepsDone: ['', 'brief', 'today', 'share'], priorities: ['a'], prep: { checks: ['x'], extra: [] }, shared: true });
    expect(ticks(v)).toEqual([true, false, true, true, true]);
    expect(ticks({ ...v, priorities: [] })[2]).toBe(false);
    expect(ticks(v, [])[0]).toBe(false);
  });
  it('older visits keep the answer-only ticks', () => {
    expect(ticks(visit({ priorities: ['a'] }))).toEqual([true, true, true, false, false]);
  });
});
