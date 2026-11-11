import type { SYNTHETIC_LABEL, TRANSCRIPT_SCHEMA_VERSION } from './constants';

/** How the transcript was entered. `sample` = the Starter Pack transcript loaded in demo mode. */
export type TranscriptSource = 'paste' | 'upload' | 'sample';

/** One line of the conversation. `speaker` is null for lines that are not "Name: words" dialogue. */
export interface TranscriptTurn {
  speaker: string | null;
  text: string;
}

/** Structured result of intake. This is the hand-off to the after-visit summary and case-building. */
export interface TranscriptPayload {
  schemaVersion: typeof TRANSCRIPT_SCHEMA_VERSION;
  /** Random per-submission ID. Not linked to any person. */
  id: string;
  /** When the transcript was accepted, ISO 8601 UTC. */
  receivedAt: string;
  source: TranscriptSource;
  stats: {
    characters: number;
    words: number;
    lines: number;
    /** Lines recognised as dialogue ("Name: words"). */
    dialogueTurns: number;
  };
  /** Names that speak at least twice, in order of first appearance (e.g. ["Theo", "Dr. Lane"]). */
  speakers: string[];
  turns: TranscriptTurn[];
  /** The cleaned transcript text. */
  transcript: string;
  /** Always present, always this exact text. */
  disclaimer: typeof SYNTHETIC_LABEL;
}

export type IntakeErrorCode = 'EMPTY' | 'TOO_LONG' | 'FILE_TYPE' | 'FILE_TOO_LARGE' | 'FILE_NOT_TEXT' | 'INVALID_INPUT';

export interface IntakeError {
  code: IntakeErrorCode;
  /** Plain-language message, safe to show. Never contains transcript content. */
  message: string;
}

export type IntakeResult<T> = { ok: true; value: T } | { ok: false; error: IntakeError };

/**
 * Outcome of the full intake pipeline.
 * `crisis`: crisis language was found. Nothing was built or kept; route the person to help.
 */
export type TranscriptOutcome =
  | { status: 'accepted'; payload: TranscriptPayload }
  | { status: 'rejected'; error: IntakeError }
  | { status: 'crisis' };
