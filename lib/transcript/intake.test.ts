import { describe, expect, it } from "vitest";
import { MAX_TRANSCRIPT_CHARS, MAX_UPLOAD_BYTES, SAFETY_DISCLAIMER } from "./constants";
import { buildTranscriptPayload, decodeTranscriptFile, normalizeTranscript, validateTranscriptText } from "./intake";

const enc = (s: string) => new TextEncoder().encode(s);

describe("normalizeTranscript", () => {
  it("normalizes CRLF and CR line endings to LF", () => {
    expect(normalizeTranscript("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("removes control characters but keeps tabs and newlines", () => {
    expect(normalizeTranscript("Dr:\tHi\u0000\u0007\nPt:\u001b ok\u007f")).toBe("Dr:\tHi\nPt: ok");
  });

  it("strips a leading byte-order mark and outer whitespace", () => {
    expect(normalizeTranscript("﻿  hello  \n")).toBe("hello");
  });
});

describe("validateTranscriptText", () => {
  it("accepts normal text and returns the cleaned value", () => {
    expect(validateTranscriptText("  Doctor: Hello\r\n")).toEqual({ ok: true, value: "Doctor: Hello" });
  });

  it.each([[""], ["   "], ["\n\t\n"], ["\u0000\u0001"]])("rejects empty-after-cleanup input %j", (raw) => {
    const r = validateTranscriptText(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("EMPTY");
  });

  it("accepts text exactly at the length limit", () => {
    expect(validateTranscriptText("a".repeat(MAX_TRANSCRIPT_CHARS)).ok).toBe(true);
  });

  it("rejects text one character over the limit", () => {
    const r = validateTranscriptText("a".repeat(MAX_TRANSCRIPT_CHARS + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TOO_LONG");
  });

  it.each([[null], [undefined], [42], [{}]])("rejects non-string input %j", (raw) => {
    const r = validateTranscriptText(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_INPUT");
  });

  it("never echoes the submitted text in an error message", () => {
    const secret = "PATIENT-NAME-XYZ ";
    const r = validateTranscriptText(secret.repeat(MAX_TRANSCRIPT_CHARS));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).not.toContain("PATIENT-NAME-XYZ");
  });
});

describe("decodeTranscriptFile", () => {
  it("decodes a UTF-8 .txt file (extension is case-insensitive)", () => {
    expect(decodeTranscriptFile("Visit.TXT", enc("Doctor: héllo"))).toEqual({ ok: true, value: "Doctor: héllo" });
  });

  it.each([["notes.pdf"], ["notes.txt.exe"], ["notes"], [".txt"], ["notes.txt:stream"]])(
    "rejects disallowed file name %j",
    (name) => {
      const r = decodeTranscriptFile(name, enc("hello"));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("FILE_TYPE");
    },
  );

  it("rejects a file over the size limit", () => {
    const r = decodeTranscriptFile("big.txt", new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(97));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects binary content renamed to .txt (invalid UTF-8)", () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);
    const r = decodeTranscriptFile("image.txt", pngHeader);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FILE_NOT_TEXT");
  });

  it("rejects content containing NUL bytes", () => {
    const r = decodeTranscriptFile("x.txt", enc("abc\u0000def"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FILE_NOT_TEXT");
  });
});

describe("buildTranscriptPayload", () => {
  it("builds the full payload with metadata, stats, and the exact disclaimer", () => {
    const now = new Date("2026-11-04T12:00:00.000Z");
    const payload = buildTranscriptPayload("Doctor: Hi there\nPatient: Hello", "paste", now, "test-id");
    expect(payload).toEqual({
      schemaVersion: 1,
      id: "test-id",
      receivedAt: "2026-11-04T12:00:00.000Z",
      source: "paste",
      stats: { characters: 31, words: 5, lines: 2 },
      transcript: "Doctor: Hi there\nPatient: Hello",
      disclaimer: "Synthetic - illustrative only, not medical advice",
    });
    expect(payload.disclaimer).toBe(SAFETY_DISCLAIMER);
  });

  it("generates a UUID and current timestamp by default", () => {
    const payload = buildTranscriptPayload("hi", "upload");
    expect(payload.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Number.isNaN(Date.parse(payload.receivedAt))).toBe(false);
  });
});
