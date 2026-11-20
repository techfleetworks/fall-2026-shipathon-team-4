import { describe, expect, it } from 'vitest';
import { requestStorySummary } from './storySummary';
import type { StoryDraft } from './types';

const draft = {
  opening: 'I feel tired and can’t sleep most nights',
  onset: { text: '' },
  frequency: { text: '' },
  severity: { impacts: [], text: '' },
  triggers: { choices: [], text: '' },
  tried: { choices: [], medName: '', medDose: '', medDuration: '', outcome: '', text: '' },
} as unknown as StoryDraft;

const reply = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
const offline: typeof fetch = async () => { throw new TypeError('Failed to fetch'); };
const unauthorized = reply(401, { error: { code: 'UNAUTHORIZED' } });

describe('requestStorySummary', () => {
  it('uses the server answer when there is one', async () => {
    const fields = [{ key: 'symptoms', label: 'Symptoms', clinical: 'From the server' }];
    const out = await requestStorySummary(draft, { fetchImpl: reply(200, { status: 'ok', fields }), hasSession: async () => true });
    expect(out).toEqual({ status: 'ok', fields });
  });

  it('uses the built-in engine when the server can’t be reached', async () => {
    const out = await requestStorySummary(draft, { fetchImpl: offline, hasSession: async () => false });
    expect(out.status).toBe('ok');
  });

  it('uses the built-in engine when the server wants a sign-in and there is none (demo visitor, on-device account)', async () => {
    const out = await requestStorySummary(draft, { fetchImpl: unauthorized, hasSession: async () => false });
    expect(out.status).toBe('ok');
    expect(out).not.toHaveProperty('signInExpired');
  });

  it('an expired sign-in no longer blocks: built-in engine, plus a flag so the screen can say "log in again"', async () => {
    const out = await requestStorySummary(draft, { fetchImpl: unauthorized, hasSession: async () => true });
    expect(out).toMatchObject({ status: 'ok', signInExpired: true });
  });

  it('the built-in engine still turns the words into doctor terms (same engine as the server)', async () => {
    const words = { ...draft, opening: "I'm always tired and I can't sleep" } as StoryDraft;
    const out = await requestStorySummary(words, { fetchImpl: unauthorized, hasSession: async () => false });
    expect(out.status === 'ok' && out.fields.find((f) => f.key === 'symptoms')!.clinical).toMatch(/Insomnia|low energy/i);
  });

  it('crisis words still go to crisis support on the device path', async () => {
    const crisis = { ...draft, opening: 'I want to hurt myself' } as StoryDraft;
    expect((await requestStorySummary(crisis, { fetchImpl: unauthorized, hasSession: async () => false })).status).toBe('crisis');
    expect((await requestStorySummary(crisis, { fetchImpl: offline, hasSession: async () => true })).status).toBe('crisis');
  });

  it('other server answers are passed through unchanged (e.g. a rejected empty story)', async () => {
    const out = await requestStorySummary(draft, { fetchImpl: reply(400, { error: { code: 'EMPTY_STORY', message: 'Tell us a little…' } }), hasSession: async () => true });
    expect(out).toEqual({ status: 'rejected', error: { code: 'EMPTY_STORY', message: 'Tell us a little…' } });
  });
});
