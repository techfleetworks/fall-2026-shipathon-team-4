import { describe, expect, it, vi } from 'vitest';
import { fetchDemoData, startDemo } from './demoApi';

const okBody = {
  status: 'ok',
  data: { profile: { name: 'Theo' }, medications: [], summaries: [], evidence: [], visits: [{ id: 'v' }], followUps: [], savedScripts: [] },
  label: 'Synthetic — illustrative only, not medical advice.',
};
const answer = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status });

describe('fetchDemoData', () => {
  it('returns Theo from the server, marked as demo', async () => {
    const d = await fetchDemoData({ fetchImpl: answer(okBody) });
    expect(d).toMatchObject({ profile: { name: 'Theo' }, visits: [{ id: 'v' }], demoMode: true });
  });

  it.each([
    ['not set up (404)', answer({ status: 'error' }, 404)],
    ['a server error', answer({ status: 'error' }, 500)],
    ['a bad shape', answer({ status: 'ok', data: { profile: { name: 'Theo' }, visits: 'nope' } })],
    ['no network', (async () => { throw new TypeError('offline'); }) as typeof fetch],
  ])('falls back (undefined) on %s', async (_n, fetchImpl) => {
    expect(await fetchDemoData({ fetchImpl })).toBeUndefined();
  });

  it('gives up after the time limit so the demo never hangs', async () => {
    vi.useFakeTimers();
    const hang: typeof fetch = (_u, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const p = fetchDemoData({ fetchImpl: hang, timeoutMs: 3000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBeUndefined();
    vi.useRealTimers();
  });
});

describe('startDemo', () => {
  it('loads the server copy when it is there', async () => {
    const load = vi.fn();
    expect(await startDemo(load, { fetchImpl: answer(okBody) })).toBe('server');
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ profile: { name: 'Theo' } }));
  });

  it('loads the built-in copy otherwise', async () => {
    const load = vi.fn();
    expect(await startDemo(load, { fetchImpl: answer({}, 404) })).toBe('built-in');
    expect(load).toHaveBeenCalledWith(undefined);
  });
});
