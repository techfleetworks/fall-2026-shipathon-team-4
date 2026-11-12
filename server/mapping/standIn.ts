/**
 * A stand-in for the AI mapper, for tests and the offline eval. It never touches the network and
 * costs nothing. Its answers are hand-written in the exact JSON shape Claude must return, including
 * deliberately bad answers (invented terms, invented quotes) to prove the pipeline rejects them.
 * These are NOT recordings of real Claude output (no key is used in this project).
 */
import { MapperError, type MappingEngine, type SymptomMapper } from './types.js';

export type StandInAnswer = (storyText: string, signal: AbortSignal) => unknown | Promise<unknown>;

export function createStandInMapper(answer: StandInAnswer): SymptomMapper {
  return {
    name: 'stand-in',
    async map(storyText, signal) {
      if (signal.aborted) throw new MapperError('timeout');
      return answer(storyText, signal);
    },
  };
}

/** An engine that behaves like the Claude engine but answers with the stand-in. */
export function standInEngine(answer: StandInAnswer, timeoutMs = 1000): MappingEngine {
  return { name: 'claude', mapper: createStandInMapper(answer), timeoutMs };
}
