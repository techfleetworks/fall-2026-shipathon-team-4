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

  it('uses the built-in engine when the server wants a sign-in and there is none (on-device account)', async () => {
    const out = await requestStorySummary(draft, { fetchImpl: reply(401, { error: { code: 'UNAUTHORIZED' } }), hasSession: async () => false });
    expect(out.status).toBe('ok');
  });

  it('still asks a signed-in person to log in again when their sign-in expired', async () => {
    const out = await requestStorySummary(draft, { fetchImpl: reply(401, { error: { code: 'UNAUTHORIZED' } }), hasSession: async () => true });
    expect(out).toMatchObject({ status: 'rejected', error: { code: 'UNAUTHORIZED' } });
  });
});
