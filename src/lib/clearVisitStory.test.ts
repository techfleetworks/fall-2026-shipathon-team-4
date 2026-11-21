import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { useApp as UseApp } from './store';
import type { CaseSummary } from './types';

let useApp: typeof UseApp;
// The store saves to localStorage, which the Node test runner doesn't have.
beforeAll(async () => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  ({ useApp } = await import('./store'));
});

const summary = (id: string, createdAt: string, visitId?: string) =>
  ({ id, createdAt, opening: 'Low mood', fields: [], visitId }) as unknown as CaseSummary;
const A = { id: 'a', createdAt: '2026-11-18T09:00:00.000Z' };
const B = { id: 'b', createdAt: '2026-11-19T09:00:00.000Z' };

describe('clearVisitSummaries (Name how I feel emptied)', () => {
  it('removes only that visit’s stories', () => {
    useApp.setState({
      summaries: [summary('s1', '2026-11-18T10:00:00.000Z', 'a'), summary('s2', '2026-11-19T10:00:00.000Z', 'b'), summary('s3', '2026-11-19T11:00:00.000Z', 'b')],
      visits: [A, B] as never,
    });
    useApp.getState().clearVisitSummaries(B);
    expect(useApp.getState().summaries.map((x) => x.id)).toEqual(['s1']);
  });
});
