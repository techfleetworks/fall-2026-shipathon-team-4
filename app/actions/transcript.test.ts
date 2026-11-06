import { describe, expect, it, vi } from "vitest";
import { FIELD_FILE, FIELD_TEXT, MAX_UPLOAD_BYTES, SAFETY_DISCLAIMER } from "@/lib/transcript/constants";
import { INITIAL_TRANSCRIPT_STATE } from "@/lib/transcript/types";
import { submitTranscript } from "./transcript";

// These tests call the Server Action directly, the same way an attacker could (no page, no browser checks).

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const emptyFileInput = () => new File([], "", { type: "application/octet-stream" });

describe("submitTranscript (direct call)", () => {
  it("accepts pasted text and returns a payload with the disclaimer", async () => {
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_TEXT]: "Doctor: Hi", [FIELD_FILE]: emptyFileInput() }));
    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.payload.source).toBe("paste");
      expect(state.payload.transcript).toBe("Doctor: Hi");
      expect(state.payload.disclaimer).toBe(SAFETY_DISCLAIMER);
    }
  });

  it("accepts an uploaded .txt file", async () => {
    const file = new File(["Patient: I feel fine"], "visit.txt", { type: "text/plain" });
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_TEXT]: "", [FIELD_FILE]: file }));
    expect(state.status).toBe("success");
    if (state.status === "success") expect(state.payload.source).toBe("upload");
  });

  it("rejects an empty submission", async () => {
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_TEXT]: "   ", [FIELD_FILE]: emptyFileInput() }));
    expect(state).toMatchObject({ status: "error", error: { code: "EMPTY" } });
  });

  it("rejects a request with no fields at all", async () => {
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, new FormData());
    expect(state).toMatchObject({ status: "error", error: { code: "EMPTY" } });
  });

  it("rejects text and a file sent together", async () => {
    const file = new File(["b"], "b.txt");
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_TEXT]: "a", [FIELD_FILE]: file }));
    expect(state).toMatchObject({ status: "error", error: { code: "BOTH_PROVIDED" } });
  });

  it("rejects a File smuggled into the text field", async () => {
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_TEXT]: new File(["x"], "x.txt") }));
    expect(state).toMatchObject({ status: "error", error: { code: "INVALID_INPUT" } });
  });

  it("rejects an oversized upload before reading it", async () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.txt");
    const read = vi.spyOn(file, "arrayBuffer");
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_FILE]: file }));
    expect(state).toMatchObject({ status: "error", error: { code: "FILE_TOO_LARGE" } });
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a non-FormData argument", async () => {
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, { get: () => "x" } as unknown as FormData);
    expect(state).toMatchObject({ status: "error", error: { code: "INVALID_INPUT" } });
  });

  it("returns a generic error and never logs transcript content on an unexpected failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const file = new File(["SECRET-CONTENT"], "x.txt");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new TypeError("boom SECRET-CONTENT"));
    const state = await submitTranscript(INITIAL_TRANSCRIPT_STATE, form({ [FIELD_FILE]: file }));
    expect(state).toMatchObject({ status: "error", error: { code: "INTERNAL" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET-CONTENT");
    log.mockRestore();
  });
});
