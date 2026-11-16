/**
 * The email a patient sends their doctor with a brief link (ADR-009). Opens in the patient's OWN
 * email app (a mailto: link): free, no email service, and our server never emails health links.
 *
 * Privacy: the email holds only the link and when it expires, never symptoms or other health
 * details, because emails get forwarded and sit in inboxes long after the link ends.
 */
import { APP_NAME } from './brand';

export interface ShareEmailInput {
  /** The person receiving the link. */
  recipient: { name: string; role: string; email: string };
  /** Full link, e.g. https://app.example/shared/<token>. */
  url: string;
  expiresAt: string;
  /** Patient's first name, if they want it in the email. */
  patientName?: string;
}

export interface ShareEmail {
  to: string;
  subject: string;
  body: string;
  /** Opens the patient's email app with everything filled in. */
  mailto: string;
}

/** Strip characters that could add headers or lines to a mailto: field. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export function shareEmailDraft({ recipient, url, expiresAt, patientName }: ShareEmailInput): ShareEmail {
  const when = new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const greeting = recipient.name.trim() ? `Hello ${oneLine(recipient.name)},` : 'Hello,';
  const from = patientName?.trim() ? oneLine(patientName) : 'your patient';
  const subject = `One-page summary for my upcoming visit${patientName?.trim() ? ` (${oneLine(patientName)})` : ''}`;
  const body = [
    greeting,
    '',
    `I prepared a one-page summary of what I want to discuss at my next visit. You can read it here (no sign-in needed):`,
    oneLine(url),
    '',
    `The link stops working on ${when}, or sooner if I turn it off.`,
    '',
    'Thank you,',
    from,
    '',
    `Sent with ${APP_NAME}. Patient-reported, not a diagnosis.`,
  ].join('\n');
  const to = oneLine(recipient.email);
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to, subject, body, mailto };
}
