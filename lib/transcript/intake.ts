/**
 * Transcript intake core: pure functions with no framework imports, so they are easy to
 * unit test and reuse from a Server Action, a Route Handler, or a background job.
 */
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_TRANSCRIPT_CHARS,
  MAX_UPLOAD_BYTES,
  SAFETY_DISCLAIMER,
  TRANSCRIPT_SCHEMA_VERSION,
} from "./constants";
import type { IntakeError, IntakeErrorCode, IntakeResult, TranscriptPayload, TranscriptSource } from "./types";

const MESSAGES: Record<IntakeErrorCode, string> = {
  EMPTY: "Please paste a transcript or choose a .txt file. The transcript can't be empty.",
  TOO_LONG: `The transcript is too long. Please keep it under ${MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters.`,
  BOTH_PROVIDED: "Please use one option: paste text or upload a file, not both.",
  FILE_TYPE: "Only .txt files are supported. Please save the transcript as plain text and try again.",
  FILE_TOO_LARGE: `That file is too large. Please upload a .txt file under ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB.`,
  FILE_NOT_TEXT: "We couldn't read that file as text. Please upload a plain-text (.txt) file.",
  INVALID_INPUT: "We couldn't read that submission. Please refresh the page and try again.",
  INTERNAL: "Something went wrong on our side. Please try again.",
};

export function intakeError(code: IntakeErrorCode): IntakeError {
  return { code, message: MESSAGES[code] };
}

function fail<T>(code: IntakeErrorCode): IntakeResult<T> {
  return { ok: false, error: intakeError(code) };
}

// C0 control characters except tab (\u0009) and newline (\u000A), plus DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * Clean raw transcript text: drop a leading byte-order mark, normalize CRLF/CR to LF,
 * remove control characters (keeping tabs and newlines), and trim outer whitespace.
 */
export function normalizeTranscript(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .trim();
}

/** Validate untrusted input as transcript text. Returns the cleaned text on success. */
export function validateTranscriptText(raw: unknown): IntakeResult<string> {
  if (typeof raw !== "string") return fail("INVALID_INPUT");
  // Cheap pre-check so a huge string is rejected before any regex work runs over it.
  if (raw.length > MAX_TRANSCRIPT_CHARS * 2) return fail("TOO_LONG");
  const text = normalizeTranscript(raw);
  if (text.length === 0) return fail("EMPTY");
  if (text.length > MAX_TRANSCRIPT_CHARS) return fail("TOO_LONG");
  return { ok: true, value: text };
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext) && lower.length > ext.length);
}

/**
 * Decode an uploaded file as UTF-8 text. The browser-supplied name and MIME type are not
 * trusted: the extension is an allow-list pre-check, and the real check is that the bytes
 * decode as valid UTF-8 with no NUL bytes (binary files fail here).
 */
export function decodeTranscriptFile(fileName: string, bytes: Uint8Array): IntakeResult<string> {
  if (!hasAllowedExtension(fileName)) return fail("FILE_TYPE");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail("FILE_TOO_LARGE");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("FILE_NOT_TEXT");
  }
  if (text.includes("\u0000")) return fail("FILE_NOT_TEXT");
  return { ok: true, value: text };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Build the response payload from already-validated text. `now` and `id` are injectable for tests. */
export function buildTranscriptPayload(
  text: string,
  source: TranscriptSource,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): TranscriptPayload {
  return {
    schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    id,
    receivedAt: now.toISOString(),
    source,
    stats: {
      characters: text.length,
      words: countWords(text),
      lines: text.split("\n").length,
    },
    transcript: text,
    disclaimer: SAFETY_DISCLAIMER,
  };
}
