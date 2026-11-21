import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { useApp as UseApp } from './store';
import type { ShareLink } from './types';

const snapshot = {} as ShareLink['snapshot'];
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
const DAY = 86_400_000;

describe('createShareLink start date', () => {
  it('counts the days from a future visit date', () => {
    const visit = new Date(Date.now() + 10 * DAY);
    const link = useApp.getState().createShareLink(snapshot, 30, visit);
    expect(new Date(link.expiresAt).getTime()).toBe(visit.getTime() + 30 * DAY);
  });

  it('counts from now when the visit date has passed', () => {
    const before = Date.now();
    const link = useApp.getState().createShareLink(snapshot, 60, new Date(before - 5 * DAY));
    const expires = new Date(link.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 60 * DAY);
    expect(expires).toBeLessThan(before + 60 * DAY + 5_000);
  });
});

describe('No expiration date', () => {
  it('stays active until the person stops sharing', async () => {
    const { isLinkActive } = await import('./store');
    const link = useApp.getState().createShareLink(snapshot, 0, new Date(Date.now() + 10 * DAY));
    expect(link.neverExpires).toBe(true);
    expect(isLinkActive(link, Date.now() + 50 * 365 * DAY)).toBe(true);
    useApp.getState().revokeShareLink(link.id);
    expect(isLinkActive(useApp.getState().shareLinks!.find((l) => l.id === link.id)!)).toBe(false);
  });
});
