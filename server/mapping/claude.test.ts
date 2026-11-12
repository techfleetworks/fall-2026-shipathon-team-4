/**
 * The Claude engine with a stand-in SDK client: checks what would be sent and how every kind of
 * answer is handled. No network and no key: nothing here costs money.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { CLAUDE_MAPPING_MODEL, createClaudeMapper, type MessagesClient } from './claude.js';
import { MAPPING_SYSTEM_PROMPT, SYMPTOM_MAPPING_SCHEMA } from './contract.js';
import { MapperError } from './types.js';

const SEDATION = 'Over-sedation / excessive daytime somnolence';

function clientAnswering(answer: () => Promise<unknown> | unknown) {
  const create = vi.fn(async () => answer());
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

const message = (text: string, stop_reason = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason,
});

const live = () => new AbortController().signal;

async function failureOf(p: Promise<unknown>): Promise<MapperError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof MapperError) return err;
    throw err;
  }
  throw new Error('expected the mapper to fail');
}

describe('createClaudeMapper', () => {
  it('sends Claude Opus 5.5 the guardrail prompt, the strict output format and the story as data', async () => {
    const { client, create } = clientAnswering(() => message(JSON.stringify({ crisis_language: false, symptoms: [] })));
    await createClaudeMapper({ apiKey: 'unused', client }).map('The meds make me a zombie', live());

    const [params, options] = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming, { signal: AbortSignal }];
    expect(params.model).toBe(CLAUDE_MAPPING_MODEL);
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config?.format).toEqual({ type: 'json_schema', schema: SYMPTOM_MAPPING_SCHEMA });
    expect(params.system).toEqual([{ type: 'text', text: MAPPING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content).toContain('<patient_story>\nThe meds make me a zombie\n</patient_story>');
    // Settings this model rejects are never sent.
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the parsed JSON answer for the pipeline to check', async () => {
    const answer = { crisis_language: false, symptoms: [{ term: SEDATION, patient_quote: 'zombie' }] };
    const { client } = clientAnswering(() => message(JSON.stringify(answer)));
    expect(await createClaudeMapper({ apiKey: 'unused', client }).map('zombie', live())).toEqual(answer);
  });

  it.each([
    ['declines (refusal)', () => message('', 'refusal'), 'refusal'],
    ['is cut off (max_tokens)', () => message('{"crisis_language": fal', 'max_tokens'), 'truncated'],
    ['answers in prose', () => message('Sounds like sedation.'), 'invalid-output'],
    ['has an API error', () => { throw new Anthropic.InternalServerError(500, undefined, 'overloaded', new Headers()); }, 'error'],
    ['crashes', () => { throw new Error('socket hang up'); }, 'error'],
  ])('reports a clear failure when Claude %s', async (_name, answer, reason) => {
    const { client } = clientAnswering(answer);
    const err = await failureOf(createClaudeMapper({ apiKey: 'unused', client }).map('zombie', live()));
    expect(err.reason).toBe(reason);
  });

  it('keeps only the error type, never the error text (it may quote the request)', async () => {
    const { client } = clientAnswering(() => {
      throw new Anthropic.BadRequestError(400, undefined, 'bad input near: The meds make me a zombie', new Headers());
    });
    const err = await failureOf(createClaudeMapper({ apiKey: 'unused', client }).map('The meds make me a zombie', live()));
    expect(err.detail).toBe('api-400');
    expect(err.message).not.toContain('zombie');
  });

  it('reports a timeout when the request was cancelled', async () => {
    const controller = new AbortController();
    const { client } = clientAnswering(() => {
      controller.abort();
      throw new Anthropic.APIUserAbortError();
    });
    const err = await failureOf(createClaudeMapper({ apiKey: 'unused', client }).map('zombie', controller.signal));
    expect(err.reason).toBe('timeout');
  });
});
