/**
 * Rules for visit-transcript intake ("In the room" step). One source of truth for the
 * screen, the validation and the tests. Contains no secrets.
 */

/** Required label on anything built from the Synthetic Data Starter Pack. Exact wording from Product. */
export const SYNTHETIC_LABEL = 'Synthetic — illustrative only, not medical advice.' as const;

/** Bump when the payload shape changes so later steps (after-visit summary, case-building) can detect it. */
export const TRANSCRIPT_SCHEMA_VERSION = 1 as const;

/** Max transcript length after cleanup (about 30,000 words: a long appointment). */
export const MAX_TRANSCRIPT_CHARS = 200_000;

/** Max size of an uploaded file. */
export const MAX_UPLOAD_BYTES = 512 * 1024;

/** Only plain-text uploads are accepted. Extensions are checked lower-cased. */
export const ALLOWED_UPLOAD_EXTENSIONS = ['.txt'] as const;
