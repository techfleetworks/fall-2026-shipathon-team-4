/**
 * Shared rules for transcript intake. Imported by the Server Action (server) and the
 * form (client) so both sides enforce the same limits. Contains no secrets.
 */

/** Mandatory on every payload this app produces. Do not edit without team sign-off. */
export const SAFETY_DISCLAIMER = "Synthetic - illustrative only, not medical advice" as const;

/** Bump when the payload shape changes so downstream consumers can detect it. */
export const TRANSCRIPT_SCHEMA_VERSION = 1 as const;

/** Max transcript length after cleanup (about 30,000 words: a long appointment). */
export const MAX_TRANSCRIPT_CHARS = 200_000;

/** Max size of an uploaded file. A 200,000-character UTF-8 file is at most ~800 KB. */
export const MAX_UPLOAD_BYTES = 512 * 1024;

/** Only plain-text uploads are accepted. Extensions are checked lower-cased. */
export const ALLOWED_UPLOAD_EXTENSIONS = [".txt"] as const;

/** Form field names, shared so client and server cannot drift apart. */
export const FIELD_TEXT = "transcriptText";
export const FIELD_FILE = "transcriptFile";
