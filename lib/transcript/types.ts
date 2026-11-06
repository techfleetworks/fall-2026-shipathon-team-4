import type { SAFETY_DISCLAIMER, TRANSCRIPT_SCHEMA_VERSION } from "./constants";

/** How the transcript reached the server. */
export type TranscriptSource = "paste" | "upload";

/** The structured JSON payload returned on success. Safe to send to the browser. */
export interface TranscriptPayload {
  schemaVersion: typeof TRANSCRIPT_SCHEMA_VERSION;
  /** Random per-submission ID (UUID v4). Not linked to any person. */
  id: string;
  /** Server time the transcript was accepted, ISO 8601 UTC. */
  receivedAt: string;
  source: TranscriptSource;
  stats: {
    characters: number;
    words: number;
    lines: number;
  };
  /** The cleaned transcript text (line endings normalized, control characters removed, trimmed). */
  transcript: string;
  /** Always present, always this exact text. */
  disclaimer: typeof SAFETY_DISCLAIMER;
}

export type IntakeErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "BOTH_PROVIDED"
  | "FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_TEXT"
  | "INVALID_INPUT"
  | "INTERNAL";

export interface IntakeError {
  code: IntakeErrorCode;
  /** Plain-language message, safe to show the user. Never contains transcript content. */
  message: string;
}

export type IntakeResult<T> = { ok: true; value: T } | { ok: false; error: IntakeError };

/** State returned by the submitTranscript Server Action (works with React's useActionState). */
export type TranscriptActionState =
  | { status: "idle" }
  | { status: "success"; payload: TranscriptPayload }
  | { status: "error"; error: IntakeError };

export const INITIAL_TRANSCRIPT_STATE: TranscriptActionState = { status: "idle" };
