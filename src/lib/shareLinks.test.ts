import { describe, expect, it } from 'vitest';
import { activeRecipients, isLinkActive, resolveShareToken } from './store';
import type { ShareLink, ShareRecipient } from './types';

const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
const snapshot = { who: '', priorities: [], symptoms: [], tried: '', timeline: [], askingFor: [], demo: true };

const doc = (id: string, revokedAt?: string): ShareRecipient => ({ id, name: `Dr. ${id}`, token: `tok-${id}`, sharedAt: past, revokedAt });
const link = (over: Partial<ShareLink> = {}): ShareLink => ({ id: 'L1', token: 'link-wide', createdAt: past, expiresAt: future, snapshot, ...over });

describe('per-doctor share links', () => {
  it('stopping one doctor keeps the link open for the others', () => {
    const l = link({ recipients: [doc('a', past), doc('b')] });
    expect(isLinkActive(l)).toBe(true);
    expect(activeRecipients(l).map((r) => r.id)).toEqual(['b']);
    expect(resolveShareToken([l], 'tok-a')).toBeUndefined();
    expect(resolveShareToken([l], 'tok-b')).toBe(l);
  });

  it('a link with every doctor stopped is no longer active', () => {
    const l = link({ recipients: [doc('a', past), doc('b', past)] });
    expect(isLinkActive(l)).toBe(false);
    expect(resolveShareToken([l], 'tok-b')).toBeUndefined();
  });

  it('stopping the whole link closes every doctor’s address', () => {
    const l = link({ revokedAt: past, recipients: [doc('a'), doc('b')] });
    expect(resolveShareToken([l], 'tok-a')).toBeUndefined();
    expect(resolveShareToken([l], 'tok-b')).toBeUndefined();
  });

  it('expired links open for no one', () => {
    const l = link({ expiresAt: past, recipients: [doc('a')] });
    expect(resolveShareToken([l], 'tok-a')).toBeUndefined();
  });

  it('the link-wide address only opens older links without a doctor list', () => {
    expect(resolveShareToken([link({ recipients: [doc('a')] })], 'link-wide')).toBeUndefined();
    const old = link();
    expect(resolveShareToken([old], 'link-wide')).toBe(old);
  });

  it('unknown addresses open nothing', () => {
    expect(resolveShareToken([link({ recipients: [doc('a')] })], 'nope')).toBeUndefined();
    expect(resolveShareToken([], undefined)).toBeUndefined();
  });
});
