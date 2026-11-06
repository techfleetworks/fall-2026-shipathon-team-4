"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { submitTranscript } from "@/app/actions/transcript";
import {
  FIELD_FILE,
  FIELD_TEXT,
  MAX_TRANSCRIPT_CHARS,
  MAX_UPLOAD_BYTES,
  SAFETY_DISCLAIMER,
} from "@/lib/transcript/constants";
import { INITIAL_TRANSCRIPT_STATE } from "@/lib/transcript/types";
import styles from "./TranscriptForm.module.css";

/**
 * Paste-or-upload transcript form. Calls the submitTranscript Server Action and shows the
 * returned JSON. Server-side validation is the authority; this component only guides the user.
 */
export default function TranscriptForm() {
  const [state, formAction, isPending] = useActionState(submitTranscript, INITIAL_TRANSCRIPT_STATE);
  // Controlled so the text survives React's automatic form reset after an action.
  const [text, setText] = useState("");
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const id = useId();
  const textId = `${id}-text`;
  const textHintId = `${id}-text-hint`;
  const fileId = `${id}-file`;
  const fileHintId = `${id}-file-hint`;
  const errorId = `${id}-error`;

  const hasError = state.status === "error";

  // Move focus to the outcome so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (state.status === "success") resultHeadingRef.current?.focus();
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <div className={styles.wrapper}>
      <p className={styles.notice}>
        Use synthetic (made-up) transcripts only. Do not paste or upload real patient information.
      </p>

      <form action={formAction} className={styles.form} aria-describedby={hasError ? errorId : undefined}>
        <div className={styles.field}>
          <label htmlFor={textId} className={styles.label}>
            Paste a transcript
          </label>
          <p id={textHintId} className={styles.hint}>
            Up to {MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters. Leave empty if you are uploading a file.
          </p>
          <textarea
            id={textId}
            name={FIELD_TEXT}
            className={styles.textarea}
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={hasError ? `${textHintId} ${errorId}` : textHintId}
            aria-invalid={hasError || undefined}
            spellCheck={false}
          />
          <p className={styles.counter}>
            {text.length.toLocaleString("en-US")} / {MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor={fileId} className={styles.label}>
            Or upload a .txt file
          </label>
          <p id={fileHintId} className={styles.hint}>
            Plain text only, up to {Math.round(MAX_UPLOAD_BYTES / 1024)} KB.
          </p>
          <input
            id={fileId}
            name={FIELD_FILE}
            type="file"
            accept=".txt,text/plain"
            className={styles.file}
            aria-describedby={fileHintId}
          />
        </div>

        {hasError && (
          <div id={errorId} ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>
            {state.error.message}
          </div>
        )}

        <button type="submit" className={styles.button} disabled={isPending} aria-disabled={isPending}>
          {isPending ? "Submitting…" : "Submit transcript"}
        </button>
      </form>

      {state.status === "success" && (
        <section className={styles.result} aria-labelledby={`${id}-result-heading`}>
          <h2 id={`${id}-result-heading`} ref={resultHeadingRef} tabIndex={-1} className={styles.resultHeading}>
            Transcript accepted
          </h2>
          <p className={styles.disclaimer}>{SAFETY_DISCLAIMER}</p>
          <pre className={styles.json} tabIndex={0} aria-label="Response JSON">
            {JSON.stringify(state.payload, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
