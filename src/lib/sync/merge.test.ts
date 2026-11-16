import { describe, expect, it } from 'vitest';
import { mergeRecords, same, stableJson, syncedPart, type SyncRecord } from './merge.js';

const e = (id: string, detail = id) => ({ id, date: '2026-11-01', type: 'note', title: 'Note', detail });

describe('syncedPart', () => {
  it('keeps only synced fields and removes local-only profile fields', () => {
    const out = syncedPart({
      profile: { name: 'Sam', passwordHash: { salt: 's', hash: 'h' }, email: 'sam@example.com' },
      evidence: [e('a')],
      shareLinks: [{ id: 'l', token: 't' }],
      signedIn: true,
      demoMode: false,
      textScale: 1.2,
    });
    expect(out).toEqual({ profile: { name: 'Sam' }, evidence: [e('a')], textScale: 1.2 });
  });
});

describe('stableJson / same', () => {
  it('ignores key order and undefined fields', () => {
    expect(same({ a: 1, b: { c: 2, d: undefined } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(stableJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });
});

describe('mergeRecords (three-way)', () => {
  const base: SyncRecord = { evidence: [e('a'), e('b')], textScale: 1 };

  it('nothing on the server yet: this device wins as-is', () => {
    expect(mergeRecords(null, base, null)).toEqual(base);
  });

  it('first sync on a device (no base): entries from both sides are kept, nothing is treated as deleted', () => {
    const m = mergeRecords(null, { evidence: [e('a'), e('x')] }, { evidence: [e('a'), e('y')] });
    expect(m.evidence!.map((x) => x.id)).toEqual(['a', 'x', 'y']);
  });

  it('new entries on both devices are all kept', () => {
    const m = mergeRecords(base, { evidence: [e('a'), e('b'), e('phone')] }, { evidence: [e('a'), e('b'), e('laptop')] });
    expect(m.evidence!.map((x) => x.id)).toEqual(['a', 'b', 'phone', 'laptop']);
  });

  it('deleted here, untouched on the server: stays deleted', () => {
    const m = mergeRecords(base, { evidence: [e('a')] }, { evidence: [e('a'), e('b')] });
    expect(m.evidence!.map((x) => x.id)).toEqual(['a']);
  });

  it('deleted on the server, untouched here: stays deleted', () => {
    const m = mergeRecords(base, { evidence: [e('a'), e('b')] }, { evidence: [e('b')] });
    expect(m.evidence!.map((x) => x.id)).toEqual(['b']);
  });

  it('an edit beats a delete (from either side)', () => {
    expect(mergeRecords(base, { evidence: [e('a', 'edited here'), e('b')] }, { evidence: [e('b')] }).evidence).toEqual([e('a', 'edited here'), e('b')]);
    expect(mergeRecords(base, { evidence: [e('b')] }, { evidence: [e('a', 'edited there'), e('b')] }).evidence).toEqual([e('b'), e('a', 'edited there')]);
  });

  it('edited only on the server: the server edit wins', () => {
    const m = mergeRecords(base, base, { evidence: [e('a', 'changed'), e('b')], textScale: 1 });
    expect(m.evidence![0]).toEqual(e('a', 'changed'));
  });

  it('edited on both: this device wins', () => {
    const m = mergeRecords(base, { evidence: [e('a', 'here'), e('b')] }, { evidence: [e('a', 'there'), e('b')] });
    expect(m.evidence![0]).toEqual(e('a', 'here'));
  });

  it('single fields: whichever side changed it wins; both → this device', () => {
    expect(mergeRecords(base, { ...base, textScale: 1 }, { ...base, textScale: 1.3 }).textScale).toBe(1.3);
    expect(mergeRecords(base, { ...base, textScale: 1.15 }, { ...base, textScale: 1 }).textScale).toBe(1.15);
    expect(mergeRecords(base, { ...base, textScale: 1.15 }, { ...base, textScale: 1.3 }).textScale).toBe(1.15);
  });

  it('a new device with no profile takes the backup profile', () => {
    const m = mergeRecords(null, { profile: null as unknown as undefined }, { profile: { name: 'Sam', onboarded: true } });
    expect(m.profile).toEqual({ name: 'Sam', onboarded: true });
  });

  it('merging is stable: merging the result again changes nothing', () => {
    const local = { evidence: [e('a'), e('phone')] };
    const remote = { evidence: [e('a'), e('b'), e('laptop')] };
    const m = mergeRecords(base, local, remote);
    expect(mergeRecords(m, m, m)).toEqual(m);
  });
});
