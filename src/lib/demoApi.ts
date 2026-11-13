/**
 * "Explore with demo data" (ADR-010): loads Theo from the server (GET /api/demo) so the demo shows the
 * team's live record. If the server can't be reached in time, or Theo isn't set up there, the built-in
 * copy is used instead, so the demo always runs. A visitor's changes stay on their device: demo data is
 * never sent back to the server.
 */
import type { AppData } from './store';

export const DEMO_TIMEOUT_MS = 3000;

export type DemoSourceUsed = 'server' | 'built-in';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Theo's data from the server, or undefined (then use the built-in copy). Never throws. */
export async function fetchDemoData({ fetchImpl = fetch, timeoutMs = DEMO_TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<Partial<AppData> | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl('/api/demo', { method: 'GET', signal: controller.signal });
    if (res.status !== 200) return undefined;
    const body: unknown = await res.json();
    if (!isObj(body) || body.status !== 'ok' || !isObj(body.data) || !isObj(body.data.profile)) return undefined;
    const d = body.data;
    const lists = ['medications', 'summaries', 'evidence', 'visits', 'followUps', 'savedScripts'] as const;
    if (!lists.every((k) => Array.isArray(d[k]))) return undefined;
    return { ...(d as Partial<AppData>), demoMode: true };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Loads Theo (server first, built-in as the fallback). Returns which one was used. */
export async function startDemo(loadDemo: (data?: Partial<AppData>) => void, opts?: Parameters<typeof fetchDemoData>[0]): Promise<DemoSourceUsed> {
  const data = await fetchDemoData(opts);
  loadDemo(data);
  return data ? 'server' : 'built-in';
}
