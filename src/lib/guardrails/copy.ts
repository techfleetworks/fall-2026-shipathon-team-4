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
 * Crisis-response copy, exact wording from the Copy Drafts, Section 3 ("first-pass fixture").
 * STATUS: needs mentor sign-off. Routes only to peer support that won't contact police or emergency
 * services without consent (no automatic active rescue). Numbers verified by Product Nov 2026; re-verify
 * before relying. US-centric. Hours are not 24/7.
 * Open mentor decision: whether to also offer a clearly opt-in, user-initiated emergency option.
 */
export interface CrisisResource {
  name: string;
  /** Display form, e.g. "877-565-8860". */
  phone?: string;
  /** For tel: links. */
  tel?: string;
  url?: string;
  urlLabel?: string;
  note: string;
}

export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  {
    name: 'Trans Lifeline',
    phone: '877-565-8860',
    tel: '+18775658860',
    note: 'Peer support; does not contact 911 or police without your consent.',
  },
  {
    name: 'Wildflower Alliance Peer Support Line',
    phone: '888-407-4515',
    tel: '+18884074515',
    note: 'Peer-run; doesn’t assess, report, or call the police (evenings, ET).',
  },
  {
    name: 'Find a warmline near you',
    url: 'https://warmline.org/directory',
    urlLabel: 'warmline.org/directory',
    note: 'Free, peer-run emotional support lines.',
  },
];

export const CRISIS_MESSAGE = {
  title: 'It sounds like you’re carrying something really heavy right now.',
  intro:
    'You don’t have to go through it alone — and you don’t have to do anything you’re not ready for. Reaching out is your choice, whenever and however you want. If it would help to talk to someone who gets it, here are people you can reach who won’t call the police or send anyone unless you ask them to:',
  closing: 'You can keep talking here, or close this and come back anytime. We’re not going anywhere.',
} as const;

/** Short version for the footer / inline. */
export const CRISIS_SHORT = {
  lead: 'Want to talk to someone who won’t call the police or send anyone?',
  line: 'Trans Lifeline 877-565-8860 · Wildflower Alliance 888-407-4515 · more at warmline.org',
} as const;

/** The full crisis message as one plain-text block (for the API and anywhere without rich layout). */
export function crisisMessageText(): string {
  const items = CRISIS_RESOURCES.map((r) => `• ${r.name} — ${r.phone ?? r.urlLabel}. ${r.note}`).join('\n');
  return `${CRISIS_MESSAGE.title} ${CRISIS_MESSAGE.intro}\n${items}\n${CRISIS_MESSAGE.closing}`;
}

/**
 * Shown when the output checks block a response (rule: uncertainty is honest). Placeholder wording in the
 * same voice as the doc; ask Product to confirm it.
 */
export const BLOCKED_FALLBACK =
  'I couldn’t put that into words I’m sure about. Could you tell me a little more, in your own words? If it’s a question about treatment or medication, it’s a good one to bring to your care team.';
