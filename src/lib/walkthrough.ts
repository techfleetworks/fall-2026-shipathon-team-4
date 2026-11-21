/**
 * Demo walkthrough for Name how I feel. When the person records (or types) the walkthrough script below, "Your doctor
 * reads" shows the fixed lines in WALKTHROUGH_FIELDS instead of the engine's, so the demo always looks the same.
 * Anything else that's said gets the normal summary. For the script, Main concerns and the "Your words" quotes are left
 * out, so the panel shows only the five fixed lines.
 *
 * Speech-to-text never comes out word for word, so "matching the script" means most of its key phrases were heard
 * (numbers may come out as words or digits, punctuation and case don't matter).
 */
import type { FieldKey, SummaryField } from './types';

/** What the presenter says, for reference. */
export const WALKTHROUGH_SCRIPT =
  'I have been feeling down for about 8 months and don’t feel like myself around 80 percent of the time in a week. I lost interest in a lot of stuff I used to enjoy. I pulled away from my friends. I’ve had trouble getting to sleep and then I’ve had trouble getting out of bed in the morning for a few months now. I’ve missed 4 days of work this past month. I’ve tried taking walks at least once a day. I started taking 50mg of Sertraline two months ago, and although it took some of the edge off, it makes me so nauseous. I’m not sure I can keep taking it. I’m hoping to start therapy but I am still on the waitlist.';

/** The lines "Your doctor reads" shows for the script. */
export const WALKTHROUGH_FIELDS: Partial<Record<FieldKey, string>> = {
  onset: '~8 months ago',
  frequency: '5-6 days a week; worse mornings',
  severity: 'Moderate-severe; affecting work & relationships',
  triggers: 'Poor sleep, work stress',
  tried: 'Sertraline 50mg (8 weeks), daily walks, on therapy waitlist',
};

/** Notes for your doctor › What others have noticed, filled in when the script is saved (if still empty). */
export const WALKTHROUGH_NOTICED = 'Low energy, pulling away lately.';

/** For your doctor (A1), shared links and the PDF › Symptoms › Reported: a short summary of what was said. */
export const WALKTHROUGH_REPORTED =
  'Feeling down for ~8 months and not like myself most of the week; lost interest in things I enjoyed and pulled away from friends; trouble falling asleep and getting up; missed 4 days of work this month.';

/** …› Asking for, when the visit has nothing of its own there. */
export const WALKTHROUGH_ASKING_FOR = 'Medication review, therapist referral';

const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  fifty: '50', eighty: '80',
};

/** Lowercase words only; number words become digits and "50mg" / "80%" split into their parts. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/(\d+)\s*(mg|milligrams?)\b/g, '$1 mg')
    .replace(/(\d+)\s*%/g, '$1 percent')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(' ');
}

/** Key phrases of the script; each is a list of ways it might be transcribed. */
const KEY_PHRASES: string[][] = [
  ['feeling down'],
  ['8 months'],
  ['80 percent'],
  ['lost interest'],
  ['friends'],
  ['trouble getting to sleep', 'getting to sleep', 'falling asleep'],
  ['out of bed'],
  ['missed 4 days', '4 days of work', 'missed four days'],
  ['walks', 'walk'],
  ['50 mg', 'sertraline', 'zoloft'],
  ['nauseous', 'nauseated', 'nausea'],
  ['therapy'],
  ['waitlist', 'wait list', 'waiting list'],
];

/** True when most of the script was said (at least 11 of its 13 key phrases). */
export function matchesWalkthrough(text: string): boolean {
  const t = ` ${normalize(text)} `;
  if (t.trim().length < 80) return false;
  const found = KEY_PHRASES.filter((alts) => alts.some((a) => t.includes(` ${normalize(a)} `) || t.includes(` ${normalize(a)}`))).length;
  return found >= KEY_PHRASES.length - 2;
}

/** For the script: only the walkthrough's lines (no Main concerns, no quotes). Any other text: unchanged. */
export function applyWalkthrough(fields: SummaryField[], text: string): SummaryField[] {
  if (!matchesWalkthrough(text)) return fields;
  return fields
    .filter((f) => WALKTHROUGH_FIELDS[f.key])
    .map((f) => ({ key: f.key, label: f.label, clinical: WALKTHROUGH_FIELDS[f.key]! }));
}

/* ======================================================================
   At the visit: the recorded conversation and the quick notes → Visit summary › What was said
   ====================================================================== */

/** The conversation the presenter records, for reference. */
export const VISIT_SCRIPT = `Patient: Hi Doctor—thanks for seeing me today. The sertraline has been causing constant nausea, which has made getting through the day really tough.
Doctor: I see… hmm, you shouldn’t have to push through feeling sick all the time. Let’s switch you from sertraline to bupropion instead—it’s much easier on your stomach. I see from your notes you’ve had low moods — we need to take that seriously. I’m sending a referral to a therapist for you this week to give you extra support.
Patient: That’s a huge relief. When should I come back to see how things are going?
Doctor: Let’s plan to check back in four weeks so we can see if the bupropion is helping and your nausea stays away.
Patient: Sounds like a great plan. Thank you so much for listening and helping me with this today.`;

/** The quick notes the presenter types, for reference. */
export const VISIT_NOTES =
  'Dr. [Name]: switching sertraline to bupropion for the nausea. Therapist referral going out this week. Recheck in 4 weeks to see if the new med helps.';

/** Visit summary › What was said, built from the conversation and the notes. */
export const VISIT_SAID = [
  'Switching from sertraline to bupropion, which should ease the nausea symptoms.',
  'Your low mood is being taken seriously.',
  'A referral to a therapist is going out this week.',
  'Check back in 4 weeks to see if bupropion is helping and the nausea stays away.',
];

// Key phrases; "bupropion" is often misheard by speech-to-text, so its brand name and the plan around it count too.
const VISIT_PHRASES: string[][] = [
  ['sertraline', 'zoloft'],
  ['nausea', 'nauseous', 'sick'],
  ['bupropion', 'wellbutrin', 'easier on your stomach'],
  ['low mood', 'low moods'],
  ['referral'],
  ['therapist', 'therapy'],
  ['4 weeks'],
  ['check back', 'come back', 'recheck'],
];
const NOTES_PHRASES: string[][] = [
  ['sertraline', 'zoloft'],
  ['bupropion', 'wellbutrin', 'new med'],
  ['nausea'],
  ['referral'],
  ['4 weeks'],
];

function countPhrases(text: string, phrases: string[][]): number {
  const t = ` ${normalize(text)} `;
  return phrases.filter((alts) => alts.some((a) => t.includes(` ${normalize(a)} `))).length;
}

/** True when the recording (live words or saved recap) is the walkthrough conversation: 6 of its 8 key phrases. */
export function matchesVisitRecording(text: string): boolean {
  return countPhrases(text, VISIT_PHRASES) >= VISIT_PHRASES.length - 2;
}

/** True when the quick notes are the walkthrough notes: 4 of their 5 key phrases. */
export function matchesVisitNotes(text: string): boolean {
  return countPhrases(text, NOTES_PHRASES) >= NOTES_PHRASES.length - 1;
}
