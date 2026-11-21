import { describe, expect, it } from 'vitest';
import { timeAgo } from './dates';

const T = '2026-11-21';
describe('timeAgo (Began on Name how I feel)', () => {
  it.each([
    ['2026-11-21', 'Today'],
    ['2026-11-20', 'Yesterday'],
    ['2026-11-16', '5 days ago'],
    ['2026-11-08', '13 days ago'],
    ['2026-11-07', '2 weeks ago'],
    ['2026-10-01', '7 weeks ago'],
    ['2026-09-21', '2 months ago'],
    ['2026-05-20', '6 months ago'],
    ['2024-12-01', '23 months ago'],
    ['2024-11-21', '2 years ago'],
    ['2026-11-25', 'Today'], // a future date is never shown as "ago"
  ])('%s → %s', (iso, want) => expect(timeAgo(iso, T)).toBe(want));
});
