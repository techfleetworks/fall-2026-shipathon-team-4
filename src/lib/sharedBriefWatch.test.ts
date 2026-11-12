import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSharedBrief, type WatchTarget } from './sharedBriefWatch';
import type { SharedBriefOutcome } from './sharesApi';

const TOKEN = 'T'.repeat(43);
const brief = { who: 'Theo', priorities: ['x'], symptoms: [], tried: '', timeline: [], askingFor: [], demo: true };

/** A fake server whose answer the test can change, counting requests. */
function fakeServer(expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()) {
  let state: 'ok' | 'stopped' | 'expired' | 'down' = 'ok';
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (state === 'down') throw new TypeError('offline');
    if (state === 'ok') return new Response(JSON.stringify({ status: 'ok', brief, sharedWith: { name: 'Dr. Lane', role: 'Primary care' }, expiresAt }), { status: 200 });
    const code = state === 'stopped' ? 'LINK_STOPPED' : 'LINK_EXPIRED';
    return new Response(JSON.stringify({ status: 'error', error: { code, message: '' } }), { status: 410 });
  };
  return { fetchImpl, set: (s: typeof state) => { state = s; }, calls: () => calls };
}

function fakeTarget() {
  const handlers = new Map<string, Set<() => void>>();
  const target: WatchTarget = {
    addEventListener: (t, fn) => { if (!handlers.has(t)) handlers.set(t, new Set()); handlers.get(t)!.add(fn); },
    removeEventListener: (t, fn) => handlers.get(t)?.delete(fn),
  };
  return { target, fire: (t: string) => handlers.get(t)?.forEach((fn) => fn()), count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watchSharedBrief', () => {
  it('shows the brief, then replaces it within one check after the patient stops sharing', async () => {
    const server = fakeServer();
    const seen: SharedBriefOutcome['status'][] = [];
    watchSharedBrief(TOKEN, (r) => seen.push(r.status), { fetchImpl: server.fetchImpl, intervalMs: 30_000, targets: [] });
    await settle();
    expect(seen).toEqual(['ok']);

    server.set('stopped');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(seen).toEqual(['ok', 'stopped']);
  });

  it('re-checks as soon as the doctor comes back to the tab', async () => {
    const server = fakeServer();
    const t = fakeTarget();
    const seen: string[] = [];
    watchSharedBrief(TOKEN, (r) => seen.push(r.status), { fetchImpl: server.fetchImpl, targets: [t.target], intervalMs: 60_000 });
    await settle();
    server.set('stopped');
    t.fire('visibilitychange');
    await settle();
    expect(seen.at(-1)).toBe('stopped');
  });

  it('re-checks exactly when the link expires', async () => {
    const server = fakeServer(new Date(Date.now() + 5_000).toISOString());
    const seen: string[] = [];
    watchSharedBrief(TOKEN, (r) => seen.push(r.status), { fetchImpl: server.fetchImpl, intervalMs: 600_000, targets: [] });
    await settle();
    server.set('expired');
    await vi.advanceTimersByTimeAsync(5_600);
    expect(seen.at(-1)).toBe('expired');
  });

  it('keeps the brief on screen through a network blip, then recovers', async () => {
    const server = fakeServer();
    const seen: string[] = [];
    watchSharedBrief(TOKEN, (r) => seen.push(r.status), { fetchImpl: server.fetchImpl, intervalMs: 1_000, targets: [] });
    await settle();
    server.set('down');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen).toEqual(['ok']);
    server.set('stopped');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen).toEqual(['ok', 'stopped']);
  });

  it('stops checking after a definite end, and when the page closes', async () => {
    const server = fakeServer();
    const t = fakeTarget();
    watchSharedBrief(TOKEN, () => {}, { fetchImpl: server.fetchImpl, intervalMs: 1_000, targets: [t.target] });
    await settle();
    server.set('stopped');
    await vi.advanceTimersByTimeAsync(1_000);
    const after = server.calls();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.calls()).toBe(after);
    expect(t.count()).toBe(0);

    const server2 = fakeServer();
    const t2 = fakeTarget();
    const stop = watchSharedBrief(TOKEN, () => {}, { fetchImpl: server2.fetchImpl, intervalMs: 1_000, targets: [t2.target] });
    await settle();
    stop();
    const before = server2.calls();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server2.calls()).toBe(before);
    expect(t2.count()).toBe(0);
  });

  it('does not check while the page is hidden', async () => {
    const server = fakeServer();
    watchSharedBrief(TOKEN, () => {}, { fetchImpl: server.fetchImpl, intervalMs: 1_000, targets: [], isVisible: () => false });
    await settle();
    const first = server.calls();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(server.calls()).toBe(first);
  });
});
