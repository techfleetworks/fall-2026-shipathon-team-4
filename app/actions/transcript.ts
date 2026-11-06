"use server";

/**
 * Server Action: accept a pasted or uploaded transcript and return a structured payload.
 *
 * Security notes (OWASP Next.js + File Upload cheat sheets):
 * - A Server Action is a public POST endpoint. Anyone can call it directly, without the page,
 *   so every input is validated here, never only in the browser.
 * - No authentication exists yet. When accounts are added, derive the user here, on the server.
 * - Nothing is stored and transcript content is never logged (it may contain health details).
 */
import { FIELD_FILE, FIELD_TEXT, MAX_UPLOAD_BYTES } from "@/lib/transcript/constants";
import {
  buildTranscriptPayload,
  decodeTranscriptFile,
  intakeError,
  validateTranscriptText,
} from "@/lib/transcript/intake";
import type { IntakeResult, TranscriptActionState, TranscriptSource } from "@/lib/transcript/types";

function isNonEmptyFile(value: FormDataEntryValue | null): value is File {
  // Browsers send an empty, unnamed File when the file input is left blank.
  return typeof value === "object" && value !== null && value.size > 0;
}

async function readRawTranscript(
  formData: FormData,
): Promise<IntakeResult<{ raw: string; source: TranscriptSource }>> {
  const textEntry = formData.get(FIELD_TEXT);
  const file = formData.get(FIELD_FILE);

  // The text field must be a string (or absent). A File smuggled into it is rejected.
  if (textEntry !== null && typeof textEntry !== "string") return { ok: false, error: intakeError("INVALID_INPUT") };
  const text: string = textEntry ?? "";
  const hasText = text.trim().length > 0;
  const hasFile = isNonEmptyFile(file);

  if (hasText && hasFile) return { ok: false, error: intakeError("BOTH_PROVIDED") };

  if (hasFile) {
    // Check the declared size before reading any bytes into memory.
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: intakeError("FILE_TOO_LARGE") };
    const decoded = decodeTranscriptFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (!decoded.ok) return decoded;
    return { ok: true, value: { raw: decoded.value, source: "upload" } };
  }

  return { ok: true, value: { raw: text, source: "paste" } };
}

export async function submitTranscript(
  _previousState: TranscriptActionState,
  formData: FormData,
): Promise<TranscriptActionState> {
  try {
    if (!(formData instanceof FormData)) return { status: "error", error: intakeError("INVALID_INPUT") };

    const input = await readRawTranscript(formData);
    if (!input.ok) return { status: "error", error: input.error };

    const validated = validateTranscriptText(input.value.raw);
    if (!validated.ok) return { status: "error", error: validated.error };

    return { status: "success", payload: buildTranscriptPayload(validated.value, input.value.source) };
  } catch (err) {
    // Log the error type only: never the transcript, the form data, or the message text.
    console.error("[submitTranscript] unexpected failure:", err instanceof Error ? err.name : typeof err);
    return { status: "error", error: intakeError("INTERNAL") };
  }
}
