/**
 * User-facing disclaimer lines (ticket B1). Exact wording from "Week-1 Product & Pitch — Copy Drafts",
 * Section 3 (Nov 2, 2026). Change wording only with Product.
 *
 * The app name is NOT locked, so it is never hardcoded here: every line that names the app uses the
 * {app} token, filled in by withAppName(). Pass whatever name the team settles on.
 */

export const APP_TOKEN = '{app}';

export interface DisclaimerLine {
  /** Bold lead-in, if the line has one. */
  title?: string;
  body: string;
}

export const DISCLAIMERS = {
  /** Main disclaimer. */
  notMedicalAdvice: {
    title: 'This isn’t medical advice.',
    body: '{app} helps you prepare for and understand your care — it doesn’t diagnose, treat, or replace your clinician.',
  },
  /** Short version for footers and tooltips. */
  short: { body: 'Not a diagnosis or medical advice — a tool to help you be heard.' },
  notForEmergencies: {
    title: 'Not for emergencies.',
    body: 'If you’re having a medical emergency — chest pain, trouble breathing, signs of a stroke — call 911 or go to the emergency room. Don’t wait on the app.',
  },
  aiCanBeWrong: {
    title: 'This is AI — double-check it.',
    body: '{app} can make mistakes. Confirm anything important with your doctor or care team before you act on it.',
  },
  /** First-run / onboarding line. */
  onboarding: {
    body: '{app} helps you put your experience into words your care team will act on. It won’t diagnose you or tell you what to do — it helps you ask better questions and be believed.',
  },
} as const satisfies Record<string, DisclaimerLine>;

export type DisclaimerKey = keyof typeof DISCLAIMERS;

/** Replace every {app} token with the app's display name. */
export function withAppName(text: string, appName: string): string {
  return text.split(APP_TOKEN).join(appName);
}

/** A disclaimer as one plain string (title + body), with the app name filled in. */
export function disclaimerText(key: DisclaimerKey, appName: string): string {
  const line: DisclaimerLine = DISCLAIMERS[key];
  return withAppName([line.title, line.body].filter(Boolean).join(' '), appName);
}

/**
 * Shown when the output checks block a response (rule: uncertainty is honest). Placeholder wording in the
 * same voice as the doc; ask Product to confirm it.
 */
export const BLOCKED_FALLBACK =
  'I couldn’t put that into words I’m sure about. Could you tell me a little more, in your own words? If it’s a question about treatment or medication, it’s a good one to bring to your care team.';
