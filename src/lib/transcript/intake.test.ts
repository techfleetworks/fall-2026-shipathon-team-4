import { describe, expect, it } from 'vitest';
import { THEO_SAMPLE_TRANSCRIPT } from '../../data/sampleTranscript';
import { MAX_TRANSCRIPT_CHARS, MAX_UPLOAD_BYTES, SYNTHETIC_LABEL } from './constants';
import {
  buildTranscriptPayload,
  decodeTranscriptFile,
  normalizeTranscript,
  parseTurns,
  processTranscript,
  validateTranscriptText,
} from './intake';

const enc = (s: string) => new TextEncoder().encode(s);

describe('normalizeTranscript', () => {
  it('normalizes CRLF and CR line endings to LF', () => {
    expect(normalizeTranscript('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('removes control characters but keeps tabs and newlines', () => {
    expect(normalizeTranscript('Dr:\tHi\u0000\u0007\nPt:\u001b ok\u007f')).toBe('Dr:\tHi\nPt: ok');
  });
  it('strips a leading byte-order mark and outer whitespace', () => {
    expect(normalizeTranscript('﻿  hello  \n')).toBe('hello');
  });
});

describe('validateTranscriptText', () => {
  it.each([[''], ['   '], ['\n\t\n'], ['\u0000\u0001']])('rejects empty-after-cleanup input %j', (raw) => {
    const r = validateTranscriptText(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EMPTY');
  });
  it('accepts text exactly at the length limit and rejects one character over', () => {
    expect(validateTranscriptText('a'.repeat(MAX_TRANSCRIPT_CHARS)).ok).toBe(true);
    const r = validateTranscriptText('a'.repeat(MAX_TRANSCRIPT_CHARS + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('TOO_LONG');
  });
  it.each([[null], [undefined], [42], [{}]])('rejects non-string input %j', (raw) => {
    const r = validateTranscriptText(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_INPUT');
  });
});

describe('decodeTranscriptFile', () => {
  it('decodes a UTF-8 .txt file (extension is case-insensitive)', () => {
    expect(decodeTranscriptFile('Visit.TXT', enc('Theo: héllo — ok'))).toEqual({ ok: true, value: 'Theo: héllo — ok' });
  });
  it.each([['notes.pdf'], ['notes.txt.exe'], ['notes'], ['.txt'], ['notes.txt:stream']])('rejects file name %j', (name) => {
    const r = decodeTranscriptFile(name, enc('hello'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FILE_TYPE');
  });
  it('rejects a file over the size limit', () => {
    const r = decodeTranscriptFile('big.txt', new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(97));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FILE_TOO_LARGE');
  });
  it('rejects binary content renamed to .txt', () => {
    const r = decodeTranscriptFile('image.txt', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FILE_NOT_TEXT');
  });
  it('rejects content containing NUL bytes', () => {
    const r = decodeTranscriptFile('x.txt', enc('abc\u0000def'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FILE_NOT_TEXT');
  });
});

describe('parseTurns', () => {
  it('finds the two speakers in Theo’s transcript and keeps the header lines as notes', () => {
    const { speakers, turns } = parseTurns(normalizeTranscript(THEO_SAMPLE_TRANSCRIPT));
    expect(speakers).toEqual(['Theo', 'Dr. Lane']);
    expect(turns.filter((t) => t.speaker === 'Theo')).toHaveLength(4);
    expect(turns.filter((t) => t.speaker === 'Dr. Lane')).toHaveLength(3);
    expect(turns[0]).toEqual({ speaker: null, text: SYNTHETIC_LABEL });
    expect(turns.find((t) => t.text.startsWith('Hero:'))?.speaker).toBeNull();
  });
  it('treats text with no dialogue lines as notes', () => {
    expect(parseTurns('Just some notes\nabout the visit')).toEqual({
      speakers: [],
      turns: [{ speaker: null, text: 'Just some notes' }, { speaker: null, text: 'about the visit' }],
    });
  });
});

describe('buildTranscriptPayload', () => {
  it('builds the full payload with metadata, stats, turns, and the exact synthetic label', () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    const payload = buildTranscriptPayload('Theo: I feel dizzy\nDr. Lane: Give it time\nTheo: Okay', 'paste', now, 'test-id');
    expect(payload).toEqual({
      schemaVersion: 1,
      id: 'test-id',
      receivedAt: '2026-11-06T12:00:00.000Z',
      source: 'paste',
      stats: { characters: 52, words: 11, lines: 3, dialogueTurns: 2 },
      speakers: ['Theo'],
      turns: [
        { speaker: 'Theo', text: 'I feel dizzy' },
        { speaker: null, text: 'Dr. Lane: Give it time' },
        { speaker: 'Theo', text: 'Okay' },
      ],
      transcript: 'Theo: I feel dizzy\nDr. Lane: Give it time\nTheo: Okay',
      disclaimer: 'Synthetic — illustrative only, not medical advice.',
    });
  });
});

describe('processTranscript (full pipeline)', () => {
  it('accepts Theo’s sample transcript as-is', () => {
    const out = processTranscript(THEO_SAMPLE_TRANSCRIPT, 'sample');
    expect(out.status).toBe('accepted');
    if (out.status === 'accepted') {
      expect(out.payload.source).toBe('sample');
      expect(out.payload.speakers).toEqual(['Theo', 'Dr. Lane']);
      expect(out.payload.stats.dialogueTurns).toBe(7);
      expect(out.payload.disclaimer).toBe(SYNTHETIC_LABEL);
    }
  });

  it('routes the Starter Pack safety fixture to the crisis path and builds nothing', () => {
    // scenarios.csv row with is_safety_fixture=true. Test-only: never demo content.
    const out = processTranscript("Dr. Lane: How have things been?\nTheo: I don't see the point anymore", 'paste');
    expect(out).toEqual({ status: 'crisis' });
  });

  it('catches crisis language split by control characters', () => {
    expect(processTranscript('Theo: I want to d\u0000ie', 'paste')).toEqual({ status: 'crisis' });
  });

  it('checks for crisis language before rejecting an over-long transcript', () => {
    const long = 'a'.repeat(MAX_TRANSCRIPT_CHARS) + ' I want to die';
    expect(processTranscript(long, 'paste')).toEqual({ status: 'crisis' });
  });

  it('rejects empty input without reaching the payload', () => {
    expect(processTranscript('   ', 'paste')).toMatchObject({ status: 'rejected', error: { code: 'EMPTY' } });
  });

  it('never echoes transcript content in an error message', () => {
    const out = processTranscript('PATIENT-SECRET '.repeat(MAX_TRANSCRIPT_CHARS / 10), 'paste');
    expect(out.status).toBe('rejected');
    if (out.status === 'rejected') expect(out.error.message).not.toContain('PATIENT-SECRET');
  });
});
