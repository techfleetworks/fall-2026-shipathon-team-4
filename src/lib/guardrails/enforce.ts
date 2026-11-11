/**
 * The one function the engine calls around every response:
 *   1. crisis in the user's input → crisis path (nothing generated is shown)
 *   2. output breaks a rule        → blocked, show the honest fallback instead
 *   3. otherwise                   → show the output
 */
import { hasCrisisLanguage } from '../safety.js';
import { checkOutput, type CheckContext, type Violation } from './checks.js';
import { BLOCKED_FALLBACK } from './copy.js';
import type { StoryDraft } from '../types.js';

export type GuardResult =
  | { status: 'crisis' }
  | { status: 'blocked'; message: string; violations: Violation[] }
  | { status: 'ok'; text: string };

/**
 * True if crisis language appears anywhere in a story draft: the opening, any step's typed or spoken
 * text, or the medication fields. Used as the backstop before a summary or brief is built, so crisis
 * text is never folded into one (team rule), whichever button or path got the person there.
 */
export function storyDraftHasCrisis(d: StoryDraft): boolean {
  return hasCrisisLanguage(
    d.opening,
    d.onset.text,
    d.frequency.text,
    d.severity.text,
    d.triggers.text,
    d.tried.text,
    d.tried.outcome,
    d.tried.medName,
    d.tried.medDose,
    d.tried.medDuration,
  );
}

export function guardResponse(output: string, ctx: CheckContext): GuardResult {
  if (hasCrisisLanguage(ctx.input)) return { status: 'crisis' };
  const result = checkOutput(output, ctx);
  if (result.violations.some((v) => v.rule === 'crisis-priority')) return { status: 'crisis' };
  if (!result.ok) return { status: 'blocked', message: BLOCKED_FALLBACK, violations: result.violations };
  return { status: 'ok', text: output };
}
