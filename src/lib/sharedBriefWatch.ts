/**
 * Keeps an open doctor link honest (ADR-009). Without this, a brief stays on the doctor's screen after the
 * patient presses "Stop sharing" or the link expires, until the page is refreshed.
 *
 * Re-checks the server link: AT ONCE when the server signals "stopped" (Supabase Realtime, shareSignal.ts),
 * and as a backup every `intervalMs`, whenever the page becomes visible or focused again, and exactly when
 * the link expires. Each answer goes to `onResult`. Framework-free so it can be tested
 * with fake timers; Shared.tsx wires it to React.
 *
 * Only a definite answer ends the view: "stopped", "expired" or "missing". A network blip ("unavailable")
 * keeps what's on screen and tries again at the next check.
 */
import { fetchSharedBrief, type SharedBriefOutcome } from './sharesApi';

export const RECHECK_MS = 30_000;

export interface WatchTarget {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export interface WatchOptions {
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  /** Where focus/visibility events come from (the window and document in the browser). */
  targets?: WatchTarget[];
  /** For "visibilitychange": is the page showing? */
  isVisible?: () => boolean;
  /** Instant signal from the server that the link was stopped (shareSignal.ts). Returns an "unlisten" function. */
  listen?: (onSignal: () => void) => () => void;
}

/** Starts watching. Returns a function that stops every timer and listener. */
export function watchSharedBrief(token: string, onResult: (r: SharedBriefOutcome) => void, opts: WatchOptions = {}): () => void {
  const {
    intervalMs = RECHECK_MS,
    fetchImpl,
    targets = defaultTargets(),
    isVisible = () => (globalThis as { document?: { visibilityState?: string } }).document?.visibilityState !== 'hidden',
    listen,
  } = opts;

  let stopped = false;
  let inFlight = false;
  let again = false; // a signal arrived during a check: check once more right after
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  const check = async () => {
    if (stopped) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    try {
      const r = await fetchSharedBrief(token, fetchImpl ? { fetchImpl } : {});
      if (stopped) return;
      if (r.status === 'unavailable') return; // keep what's showing; try again later
      onResult(r);
      if (r.status === 'ok') scheduleExpiry(r.expiresAt);
      else stop(); // a definite end: no more checks needed
    } finally {
      inFlight = false;
      if (again && !stopped) {
        again = false;
        void check();
      }
    }
  };

  const scheduleExpiry = (expiresAt: string) => {
    clearTimeout(expiryTimer);
    const ms = new Date(expiresAt).getTime() - Date.now();
    // setTimeout can't wait longer than ~24.8 days; the interval covers anything beyond that.
    if (ms <= 2_147_000_000) expiryTimer = setTimeout(() => void check(), Math.max(ms, 0) + 500);
  };

  const onVisible = () => {
    if (isVisible()) void check();
  };
  const interval = setInterval(() => {
    if (isVisible()) void check();
  }, intervalMs);
  for (const t of targets) {
    t.addEventListener('focus', onVisible);
    t.addEventListener('visibilitychange', onVisible);
  }
  // Instant path: the server says "stopped" → ask the server now (even if the tab is in the background).
  const unlisten = listen ? listen(() => void check()) : () => {};

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    clearTimeout(expiryTimer);
    unlisten();
    for (const t of targets) {
      t.removeEventListener('focus', onVisible);
      t.removeEventListener('visibilitychange', onVisible);
    }
  }

  void check();
  return stop;
}

function defaultTargets(): WatchTarget[] {
  const g = globalThis as { window?: WatchTarget; document?: WatchTarget };
  return [g.window, g.document].filter((t): t is WatchTarget => !!t);
}
