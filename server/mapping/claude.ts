/**
 * The optional Claude engine for plain → clinical mapping (ADR-006).
 *
 * OFF by default and costs nothing unless BOTH are set on the server: MAPPING_ENGINE=claude and
 * ANTHROPIC_API_KEY. The key is server-only (never a VITE_ variable), so the browser can't reach it.
 *
 * Claude only returns structured JSON (approved terms + the patient's exact quotes). The answer is
 * then checked by contract.ts and the guardrails; on any problem the pipeline uses the rules engine.
 */
import Anthropic from '@anthropic-ai/sdk';
import { MAPPING_SYSTEM_PROMPT, SYMPTOM_MAPPING_SCHEMA, buildMappingUserMessage } from './contract.js';
import { MapperError, type SymptomMapper } from './types.js';

/** ADR-001: Claude Opus 5.5, called only from Express. */
export const CLAUDE_MAPPING_MODEL = 'claude-opus-5-5';

/** The subset of the SDK client this engine uses (lets tests pass a stand-in client, no network). */
export type MessagesClient = Pick<Anthropic, 'messages'>;

export interface ClaudeMapperOptions {
  apiKey: string;
  /** For tests: a stand-in client. Never set in production. */
  client?: MessagesClient;
}

export function createClaudeMapper({ apiKey, client }: ClaudeMapperOptions): SymptomMapper {
  // One retry at most: the pipeline has its own deadline and a free fallback.
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: 1 });

  return {
    name: 'claude',
    async map(storyText, signal) {
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create(
          {
            model: CLAUDE_MAPPING_MODEL,
            // Thinking stays on (adaptive) on this model; room for it plus a short JSON answer.
            max_tokens: 4000,
            // Choosing from a fixed list is a simple task, and the preview should feel quick.
            output_config: { effort: 'low', format: { type: 'json_schema', schema: SYMPTOM_MAPPING_SCHEMA } },
            // The system prompt never changes between requests, so it can be cached.
            system: [{ type: 'text', text: MAPPING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: buildMappingUserMessage(storyText) }],
          },
          { signal },
        );
      } catch (err) {
        if (signal.aborted) throw new MapperError('timeout');
        // Only the error class is kept: SDK errors can quote parts of the request.
        throw new MapperError('error', err instanceof Anthropic.APIError ? `api-${err.status ?? 'connection'}` : 'unknown');
      }

      if (response.stop_reason === 'refusal') throw new MapperError('refusal');
      if (response.stop_reason === 'max_tokens') throw new MapperError('truncated');

      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new MapperError('invalid-output', 'not-json');
      }
    },
  };
}
