/**
 * Drop-in disclaimer pieces (ticket B1, user-facing lines). Wording: Copy Drafts §3, kept in
 * src/lib/guardrails/copy.ts with "Appointment Ready" filled in from src/lib/brand.ts.
 * Styling uses the app's existing classes, so they fit wherever the design places them:
 *
 *   <DisclaimerNote />                          short line, for footers / under results
 *   <DisclaimerNote kind="notMedicalAdvice" />  one line of small print
 *   <DisclaimerCard kind="notForEmergencies" /> a calm card (e.g. Help page, onboarding)
 *
 * "aiCanBeWrong" only renders once AI_IN_USE is true (we only claim what we ship).
 */
import { AI_IN_USE, DISCLAIMERS, withAppName, type DisclaimerKey } from '../../lib/guardrails/copy';
import { APP_NAME } from '../../lib/brand';

function lineFor(kind: DisclaimerKey): { title?: string; body: string } | null {
  if (kind === 'aiCanBeWrong' && !AI_IN_USE) return null;
  const line: { title?: string; body: string } = DISCLAIMERS[kind];
  return { title: line.title, body: withAppName(line.body, APP_NAME) };
}

/** Small-print version: one line, title in bold. */
export function DisclaimerNote({ kind = 'short' }: { kind?: DisclaimerKey }) {
  const line = lineFor(kind);
  if (!line) return null;
  return (
    <p className="note">
      {line.title && <strong>{line.title} </strong>}
      {line.body}
    </p>
  );
}

/** Card version, for a page that needs it to stand out a little. */
export function DisclaimerCard({ kind }: { kind: DisclaimerKey }) {
  const line = lineFor(kind);
  if (!line) return null;
  return (
    <section className="pcard pcard--muted" aria-label={line.title ?? 'Disclaimer'}>
      {line.title && <strong>{line.title}</strong>}
      <p style={{ margin: 0 }}>{line.body}</p>
    </section>
  );
}
