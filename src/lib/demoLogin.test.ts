import { describe, expect, it } from 'vitest';
import { isDemoLogin } from './demoLogin';

describe('demo log-in (Theo)', () => {
  it('opens the demo with the shared details', () => {
    expect(isDemoLogin('theo@demo.com', 'DemoUser123!')).toBe(true);
    expect(isDemoLogin('  Theo@Demo.com ', 'DemoUser123!')).toBe(true);
  });
  it('does not open it with anything else', () => {
    expect(isDemoLogin('theo@demo.com', 'demouser123!')).toBe(false);
    expect(isDemoLogin('theo@demo.com', 'DemoUser123')).toBe(false);
    expect(isDemoLogin('someone@demo.com', 'DemoUser123!')).toBe(false);
  });
});
