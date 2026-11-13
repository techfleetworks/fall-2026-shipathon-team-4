/**
 * One codebase, two live sites (ADR-016). Each Vercel project sets these build-time settings:
 *
 *   Real users' site (fall-2026-shipathon-team-4.vercel.app):
 *     VITE_SITE_MODE=live              (or leave unset)
 *     VITE_DEMO_URL=https://fall-2026-shipathon-team-4-rosy.vercel.app
 *       → "Explore the demo" opens the demo site in a new tab; a real user's own data is never touched.
 *
 *   Demo site (fall-2026-shipathon-team-4-rosy.vercel.app):
 *     VITE_SITE_MODE=demo
 *     VITE_DEMO_LOGIN_EMAIL=theo.demo@example.com
 *     VITE_DEMO_LOGIN_PASSWORD=<Theo's password>   (shown publicly on purpose, team option A)
 *     VITE_LIVE_URL=https://fall-2026-shipathon-team-4.vercel.app
 *       → the start page shows Theo's login so visitors can log in and out as Theo; there is no sign-up on the demo
 *         site (it has its own Supabase project with only Theo), so "Sign up" points to the real users' site.
 *
 * Theo's account is protected however public his password is: it can't be deleted or used to share links
 * (ADR-010), and `npm run seed:theo` resets his password and data.
 */

export type SiteMode = 'live' | 'demo';

export interface SiteConfig {
  mode: SiteMode;
  /** Live site only: where "Explore the demo" goes. Undefined = load the demo in place (old behavior). */
  demoUrl?: string;
  /** Demo site only: Theo's login, shown on the start page. */
  demoLogin?: { email: string; password: string };
  /** Demo site only: the real users' site, where people create their own account. */
  liveUrl?: string;
}

type Env = Record<string, string | boolean | undefined>;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Only an https:// address (or http://localhost while developing) can be the demo link. */
function safeUrl(v: unknown): string | undefined {
  const s = text(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return u.origin + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    /* not a URL */
  }
  return undefined;
}

export function siteConfigFrom(env: Env): SiteConfig {
  const mode: SiteMode = text(env.VITE_SITE_MODE).toLowerCase() === 'demo' ? 'demo' : 'live';
  if (mode === 'demo') {
    const email = text(env.VITE_DEMO_LOGIN_EMAIL) || 'theo.demo@example.com';
    const password = text(env.VITE_DEMO_LOGIN_PASSWORD);
    const liveUrl = safeUrl(env.VITE_LIVE_URL);
    return { mode, ...(password ? { demoLogin: { email, password } } : {}), ...(liveUrl ? { liveUrl } : {}) };
  }
  const demoUrl = safeUrl(env.VITE_DEMO_URL);
  return { mode, ...(demoUrl ? { demoUrl } : {}) };
}

export const SITE: SiteConfig = siteConfigFrom(import.meta.env as Env);
