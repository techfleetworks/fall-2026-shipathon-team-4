/**
 * Picks the mapping engine from server environment variables (ADR-006).
 *
 *   MAPPING_ENGINE=rules  (or unset)               → rules engine only. Free. The default.
 *   MAPPING_ENGINE=claude + ANTHROPIC_API_KEY set → Claude, with the rules engine as the fallback.
 *   MAPPING_ENGINE=claude but no key              → rules engine (never a paid call without a key).
 *   anything else                                 → rules engine.
 */
import { createClaudeMapper } from './claude.js';
import { RULES_ENGINE } from './pipeline.js';
import type { MappingEngine } from './types.js';

/** How long the Claude engine gets before the rules answer is used (Vercel functions time out at 10 s on Hobby). */
export const CLAUDE_TIMEOUT_MS = 8000;

export interface EngineChoice {
  engine: MappingEngine;
  /** Plain note for the startup log. Never contains the key. */
  note: string;
}

export function mappingEngineFromEnv(env: NodeJS.ProcessEnv = process.env): EngineChoice {
  const requested = (env.MAPPING_ENGINE ?? '').trim().toLowerCase() || 'rules';
  const apiKey = (env.ANTHROPIC_API_KEY ?? '').trim();

  if (requested === 'claude') {
    if (!apiKey) return { engine: RULES_ENGINE, note: 'MAPPING_ENGINE=claude but ANTHROPIC_API_KEY is not set: using the free rules engine' };
    return {
      engine: { name: 'claude', mapper: createClaudeMapper({ apiKey }), timeoutMs: CLAUDE_TIMEOUT_MS },
      note: 'mapping engine: claude (rules engine as fallback)',
    };
  }
  if (requested !== 'rules') return { engine: RULES_ENGINE, note: `unknown MAPPING_ENGINE "${requested.slice(0, 20)}": using the free rules engine` };
  return { engine: RULES_ENGINE, note: 'mapping engine: rules (free)' };
}
