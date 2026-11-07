/**
 * Visit-transcript intake: pure functions with no React or browser-storage imports, so the
 * same code can move to the Express API later unchanged (README "Next steps").
 *
 * Order matters: the crisis check runs BEFORE anything is built, matching src/lib/safety.ts
 * ("A flagged message is never translated, summarized or saved").
 */
import { hasCrisisLanguage } from '../safety';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_TRANSCRIPT_CHARS,
  MAX_UPLOAD_BYTES,
  SYNTHETIC_LABEL,
  TRANSCRIPT_SCHEMA_VERSION,
} from './constants';
import type {
  IntakeError,
  IntakeErrorCode,
  IntakeResult,
  TranscriptOutcome,
  TranscriptPayload,
  TranscriptSource,
  TranscriptTurn,
} from './types';

const MESSAGES: Record<IntakeErrorCode, string> = {
  EMPTY: 'Paste the conversation or choose a .txt file. The transcript can’t be empty.',
  TOO_LONG: `That transcript is too long. Please keep it under ${MAX_TRANSCRIPT_CHARS.toLocaleString('en-US')} characters.`,
  FILE_TYPE: 'Only .txt files work for now. Save the transcript as plain text and try again.',
  FILE_TOO_LARGE: `That file is too large. Please choose a .txt file under ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB.`,
  FILE_NOT_TEXT: 'We couldn’t read that file as text. Please choose a plain-text (.txt) file.',
  INVALID_INPUT: 'We couldn’t read that. Please try again.',
};

export function intakeError(code: IntakeErrorCode): IntakeError {
  return { code, message: MESSAGES[code] };
}

function fail<T>(code: IntakeErrorCode): IntakeResult<T> {
  return { ok: false, error: intakeError(code) };
}

// C0 control characters except tab and newline, plus DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** Drop a leading BOM, normalize line endings to LF, remove control characters, trim. */
export function normalizeTranscript(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
}

/** Validate untrusted input as transcript text. Returns the cleaned text on success. */
export function validateTranscriptText(raw: unknown): IntakeResult<string> {
  if (typeof raw !== 'string') return fail('INVALID_INPUT');
  // Cheap pre-check so a huge string is rejected before any regex work runs over it.
  if (raw.length > MAX_TRANSCRIPT_CHARS * 2) return fail('TOO_LONG');
  const text = normalizeTranscript(raw);
  if (text.length === 0) return fail('EMPTY');
  if (text.length > MAX_TRANSCRIPT_CHARS) return fail('TOO_LONG');
  return { ok: true, value: text };
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext) && lower.length > ext.length);
}

/**
 * Decode an uploaded file as UTF-8 text. The file name and MIME type come from the device and
 * are not trusted: the extension is an allow-list pre-check, and the real check is that the bytes
 * decode as valid UTF-8 with no NUL bytes (binary files fail here).
 */
export function decodeTranscriptFile(fileName: string, bytes: Uint8Array): IntakeResult<string> {
  if (!hasAllowedExtension(fileName)) return fail('FILE_TYPE');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail('FILE_TOO_LARGE');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('FILE_NOT_TEXT');
  }
  if (text.includes('\u0000')) return fail('FILE_NOT_TEXT');
  return { ok: true, value: text };
}

// "Theo: words" or "Dr. Lane: words". Names start with a capital and stay short.
const DIALOGUE_LINE = /^([A-Z][A-Za-z.'’ -]{0,30}?):\s+(\S.*)$/;

/**
 * Split cleaned text into turns. A name counts as a speaker only if it starts at least two
 * lines, so header lines like "Hero: ..." or "Use: ..." are kept as plain notes.
 */
export function parseTurns(text: string): { speakers: string[]; turns: TranscriptTurn[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const line of lines) {
    const m = DIALOGUE_LINE.exec(line);
    if (m) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  }
  const speakers = [...counts.entries()].filter(([, n]) => n >= 2).map(([name]) => name);
  const known = new Set(speakers);
  const turns = lines.map((line): TranscriptTurn => {
    const m = DIALOGUE_LINE.exec(line);
    return m && known.has(m[1]!) ? { speaker: m[1]!, text: m[2]! } : { speaker: null, text: line };
  });
  return { speakers, turns };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Build the payload from already-validated, crisis-checked text. `now` and `id` are injectable for tests. */
export function buildTranscriptPayload(
  text: string,
  source: TranscriptSource,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): TranscriptPayload {
  const { speakers, turns } = parseTurns(text);
  return {
    schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    id,
    receivedAt: now.toISOString(),
    source,
    stats: {
      characters: text.length,
      words: countWords(text),
      lines: text.split('\n').length,
      dialogueTurns: turns.filter((t) => t.speaker !== null).length,
    },
    speakers,
    turns,
    transcript: text,
    disclaimer: SYNTHETIC_LABEL,
  };
}

/**
 * The whole intake pipeline: type check → crisis check → validation → payload.
 * The crisis check looks at both the raw and the cleaned text, so control characters
 * cannot be used to split a phrase and slip past it.
 */
export function processTranscript(raw: unknown, source: TranscriptSource): TranscriptOutcome {
  if (typeof raw !== 'string') return { status: 'rejected', error: intakeError('INVALID_INPUT') };
  if (raw.length <= MAX_TRANSCRIPT_CHARS * 2 && hasCrisisLanguage(raw, normalizeTranscript(raw))) {
    return { status: 'crisis' };
  }
  const validated = validateTranscriptText(raw);
  if (!validated.ok) return { status: 'rejected', error: validated.error };
  return { status: 'accepted', payload: buildTranscriptPayload(validated.value, source) };
}
