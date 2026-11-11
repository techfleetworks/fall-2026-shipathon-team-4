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

// ---------------------------------------------------------------- crisis response (ticket B3)

/**
 * Help-page and crisis-handoff content. Team decision (ADR-001 update, Nov 2026):
 *  - Help page: "Places to start if you need help." Order: warmline directory → 988 → 911.
 *    No breathing card. 988 is a neutral card labelled "for when you're in crisis" ("Free, 24/7").
 *    911 is the red emergency card.
 *  - If self-harm or suicidal intent is typed anywhere, the app surfaces 988/crisis support directly
 *    (not just the footer) and never folds it into a brief. Gentle handoff, no active-rescue or police framing.
 * Re-verify every number and link before launch. US-only.
 */
export type HelpResourceId = 'warmline' | '988' | '911';

export interface HelpAction {
  label: string;
  href: string;
  external?: boolean;
}

export interface HelpResource {
  id: HelpResourceId;
  title: string;
  /** Short label above the title, e.g. "For when you’re in crisis". */
  label?: string;
  body: string;
  actions: readonly HelpAction[];
  /** 'neutral' = calm card; 'emergency' = the red card (911 only). */
  tone: 'neutral' | 'emergency';
}

export const HELP_HEADING = 'Places to start if you need help.';

const WARMLINE: HelpResource = {
  id: 'warmline',
  title: 'Find a warmline near you',
  body: 'Free, peer-run emotional support lines.',
  actions: [{ label: 'warmline.org/directory', href: 'https://warmline.org/directory', external: true }],
  tone: 'neutral',
};

const LIFELINE_988: HelpResource = {
  id: '988',
  title: '988 Suicide & Crisis Lifeline',
  label: 'For when you’re in crisis',
  body: 'Free, 24/7',
  actions: [
    { label: 'Call 988', href: 'tel:988' },
    { label: 'Text 988', href: 'sms:988' },
    { label: 'Chat online', href: 'https://988lifeline.org/chat/', external: true },
  ],
  tone: 'neutral',
};

const EMERGENCY_911: HelpResource = {
  id: '911',
  title: 'In immediate danger?',
  body: 'Call 911 or go to the nearest emergency room.',
  actions: [{ label: 'Call 911', href: 'tel:911' }],
  tone: 'emergency',
};

/** Help page order: warmline → 988 → 911. */
export const HELP_RESOURCES: readonly HelpResource[] = [WARMLINE, LIFELINE_988, EMERGENCY_911];

/**
 * When crisis language was typed, 988 is surfaced directly: first, right under the handoff.
 * (Team rule: "surface 988/crisis support directly." The general page keeps warmline first.)
 */
export const CRISIS_DETECTED_RESOURCES: readonly HelpResource[] = [LIFELINE_988, WARMLINE, EMERGENCY_911];

/** Gentle handoff shown when crisis language is detected. The app's existing wording; no police or rescue framing. */
export const CRISIS_HANDOFF = {
  title: 'You don’t have to go through this alone.',
  body: 'It sounds like things might be really hard right now. People are ready to talk with you, any time, for free.',
  notSaved: 'We paused here. What you just wrote was not saved.',
} as const;

/** The handoff plus resources as plain text (for the API and anywhere without rich layout). */
export function crisisMessageText(): string {
  const items = CRISIS_DETECTED_RESOURCES.map(
    (r) => `• ${r.title}${r.label ? ` (${r.label.toLowerCase()})` : ''}: ${r.body}. ${r.actions.map((a) => a.label).join(' · ')}`,
  ).join('\n');
  return `${CRISIS_HANDOFF.title} ${CRISIS_HANDOFF.body}\n${items}`;
}

/**
 * Shown when the output checks block a response (rule: uncertainty is honest). Placeholder wording in the
 * same voice as the doc; ask Product to confirm it.
 */
export const BLOCKED_FALLBACK =
  'I couldn’t put that into words I’m sure about. Could you tell me a little more, in your own words? If it’s a question about treatment or medication, it’s a good one to bring to your care team.';
