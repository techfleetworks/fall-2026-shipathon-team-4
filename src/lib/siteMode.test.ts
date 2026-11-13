import { describe, expect, it } from 'vitest';
import { siteConfigFrom } from './siteMode';

describe('siteConfigFrom: one codebase, two live sites', () => {
  it('is the real users’ site unless told otherwise', () => {
    expect(siteConfigFrom({})).toEqual({ mode: 'live' });
    expect(siteConfigFrom({ VITE_SITE_MODE: 'something-else' })).toEqual({ mode: 'live' });
  });

  it('real users’ site: the demo link opens the demo site', () => {
    expect(siteConfigFrom({ VITE_SITE_MODE: 'live', VITE_DEMO_URL: ' https://fall-2026-shipathon-team-4-rosy.vercel.app/ ' }))
      .toEqual({ mode: 'live', demoUrl: 'https://fall-2026-shipathon-team-4-rosy.vercel.app' });
  });

  it.each([
    ['not https', 'http://example.com'],
    ['a script link', 'javascript:alert(1)'],
    ['not a link', 'rosy site'],
  ])('ignores a demo link that is %s (falls back to the in-place demo)', (_n, url) => {
    expect(siteConfigFrom({ VITE_DEMO_URL: url })).toEqual({ mode: 'live' });
  });

  it('allows http://localhost while developing', () => {
    expect(siteConfigFrom({ VITE_DEMO_URL: 'http://localhost:5174' }).demoUrl).toBe('http://localhost:5174');
  });

  it('demo site: shows Theo’s login when the password is set', () => {
    expect(siteConfigFrom({ VITE_SITE_MODE: 'Demo', VITE_DEMO_LOGIN_PASSWORD: ' secret-pass ' }))
      .toEqual({ mode: 'demo', demoLogin: { email: 'theo.demo@example.com', password: 'secret-pass' } });
  });

  it('demo site: no login card without a password, and it never links to itself', () => {
    expect(siteConfigFrom({ VITE_SITE_MODE: 'demo', VITE_DEMO_URL: 'https://x.vercel.app' })).toEqual({ mode: 'demo' });
  });

  it('demo site: knows the real users’ site for "create my own account"', () => {
    expect(siteConfigFrom({ VITE_SITE_MODE: 'demo', VITE_LIVE_URL: 'https://fall-2026-shipathon-team-4.vercel.app' }))
      .toEqual({ mode: 'demo', liveUrl: 'https://fall-2026-shipathon-team-4.vercel.app' });
    expect(siteConfigFrom({ VITE_SITE_MODE: 'demo', VITE_LIVE_URL: 'javascript:alert(1)' })).toEqual({ mode: 'demo' });
  });

  it('the real users’ site never shows a demo password, even if one is set by mistake', () => {
    expect(siteConfigFrom({ VITE_SITE_MODE: 'live', VITE_DEMO_LOGIN_PASSWORD: 'leaked' })).not.toHaveProperty('demoLogin');
  });
});
