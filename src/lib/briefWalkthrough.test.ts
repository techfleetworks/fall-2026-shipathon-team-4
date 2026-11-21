import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { buildBriefSnapshot as Build } from './brief';
import type { AppData } from './store';
import { WALKTHROUGH_ASKING_FOR, WALKTHROUGH_REPORTED, WALKTHROUGH_SCRIPT } from './walkthrough';

let buildBriefSnapshot: typeof Build;
// The store saves to localStorage, which the Node test runner doesn't have.
beforeAll(async () => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  ({ buildBriefSnapshot } = await import('./brief'));
});

const visit = { id: 'v', date: '2026-12-20', priorities: ['Low mood is affecting work'], askingFor: [] };
const state = (opening: string, askingFor: string[] = []) => ({
  profile: { name: 'Theo', age: 30 }, medications: [], evidence: [], demoMode: true,
  visits: [{ ...visit, askingFor }],
  summaries: [{ id: 's', createdAt: '2026-11-21T10:00:00Z', opening, fields: [
    { key: 'symptoms', label: 'Symptoms', clinical: 'Depressed mood' },
    { key: 'onset', label: 'Onset', clinical: '~8 months ago' },
  ] }],
}) as unknown as AppData;

describe('For your doctor (brief)', () => {
  it('calls onset "Began"', () => {
    const b = buildBriefSnapshot(state('I feel tired'), state('I feel tired').visits[0]);
    expect(b.symptoms.map((s) => s.label)).toEqual(['Reported', 'Began']);
  });

  it('walkthrough: Reported is the short summary, Asking for is set', () => {
    const s = state(WALKTHROUGH_SCRIPT);
    const b = buildBriefSnapshot(s, s.visits[0]);
    expect(b.symptoms[0]).toEqual({ label: 'Reported', clinical: WALKTHROUGH_REPORTED });
    expect(b.symptoms.map((x) => x.label)).toEqual(['Reported', 'Began']);
    expect(b.askingFor).toEqual([WALKTHROUGH_ASKING_FOR]);
  });

  it('walkthrough keeps an Asking for the person set themselves', () => {
    const s = state(WALKTHROUGH_SCRIPT, ['A second opinion']);
    expect(buildBriefSnapshot(s, s.visits[0]).askingFor).toEqual(['A second opinion']);
  });
});
