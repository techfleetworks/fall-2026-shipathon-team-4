/** Shared types for the plain → clinical mapping pipeline (ADR-006). */

/** Which engine produced a summary. `rules` is free and always available. */
export type EngineName = 'rules' | 'claude';

/** Why an AI answer was not used (the rules engine answered instead). No patient text, ever. */
export type FallbackReason = 'timeout' | 'error' | 'refusal' | 'truncated' | 'invalid-output' | 'guardrail';

/**
 * Something that maps the patient's words to approved terms. It returns the raw answer; the
 * pipeline validates it (contract.ts) before anything is used.
 */
export interface SymptomMapper {
  readonly name: 'claude' | 'stand-in';
  map(storyText: string, signal: AbortSignal): Promise<unknown>;
}

/** A mapper failure with a reason the pipeline can log and count. `detail` never holds patient text. */
export class MapperError extends Error {
  constructor(
    readonly reason: Exclude<FallbackReason, 'guardrail'>,
    readonly detail?: string,
  ) {
    super(`mapper failed: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'MapperError';
  }
}

/** The configured engine: rules alone, or an AI mapper with rules as the fallback. */
export interface MappingEngine {
  readonly name: EngineName;
  readonly mapper?: SymptomMapper;
  /** How long to wait for the mapper before using the rules engine. */
  readonly timeoutMs: number;
}
