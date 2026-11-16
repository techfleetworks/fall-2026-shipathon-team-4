/**
 * Clinical → plain glossary (board card "Clinical → plain explainer", ADR-007).
 *
 * Every explanation is written once, here, and checked by the guardrail tests: it says what a word
 * MEANS, never that the reader has it, never what to do about it, and never a dose. Wording is a draft
 * for Product (Dominic) and the mentor to review: change the text here and the tests re-check it.
 *
 * Sources: the app's approved doctor-terms vocabulary (translate.ts) and the shorthand in the
 * Starter Pack's clinical_note.txt / labs.csv. SYNTHETIC data only.
 */

export type GlossaryKind = 'term' | 'shorthand';

export interface GlossaryEntry {
  id: string;
  /** Display name, e.g. "Somnolence". */
  term: string;
  kind: GlossaryKind;
  /** What to look for. Shorthand is case-sensitive where lowercase would match ordinary words (RV, BP). */
  match: RegExp;
  /** The plain explanation. A function when it depends on what was matched (e.g. "5/52" → 5 weeks). */
  plain: string | ((m: RegExpExecArray) => string);
}

const weeks = (n: number) => `${n} ${n === 1 ? 'week' : 'weeks'}`;

/**
 * Longer, more specific entries come before shorter ones they contain (e.g. "orthostatic hypotension"
 * before "orthostatic", "postural BP" before "BP"): an overlapping shorter match is skipped.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  // ------------------------------------------------------------- shorthand in clinical notes
  { id: 'age', term: 'y/o', kind: 'shorthand', match: /\b(\d{1,3})\s?y\/o\b/i, plain: (m) => `${m[1]} years old.` },
  { id: 'history-of', term: 'h/o', kind: 'shorthand', match: /\bh\/o\b/i, plain: 'History of: something the person has had before, or has now.' },
  { id: 'complains-of', term: 'c/o', kind: 'shorthand', match: /\bc\/o\b/i, plain: 'Complains of: what the person reported. A standard note phrase, not a judgment.' },
  {
    id: 'weeks',
    term: 'N/52',
    kind: 'shorthand',
    match: /\b(\d{1,2})\/52\b/,
    plain: (m) => `${weeks(Number(m[1]))}. Clinicians write weeks as a number over 52 (the weeks in a year).`,
  },
  { id: 'query', term: 'query', kind: 'shorthand', match: /\bquery\b|(?<=^|\s)\?(?=[a-z])/i, plain: 'Query (or a "?" in front of a word): something being considered or checked, not confirmed.' },
  { id: 'versus', term: 'vs.', kind: 'shorthand', match: /\bvs\.?(?=\s)/i, plain: 'Versus: the note is weighing two possible explanations against each other.' },
  { id: 'postural-bp', term: 'postural BP', kind: 'shorthand', match: /\bpostural (?:BP|blood pressure)\b/i, plain: 'Blood pressure measured sitting or lying down, then again after standing, to see whether it drops.' },
  { id: 'bp', term: 'BP', kind: 'shorthand', match: /\bBP\b/, plain: 'Blood pressure.' },
  { id: 'review', term: 'RV', kind: 'shorthand', match: /\bRV\b/, plain: 'Review: a follow-up visit.' },
  { id: 'follow-up', term: 'f/u', kind: 'shorthand', match: /\bf\/u\b/i, plain: 'Follow-up: a later visit or check-in.' },
  { id: 'prn', term: 'PRN', kind: 'shorthand', match: /\bPRN\b/, plain: 'As needed, rather than on a fixed schedule.' },
  { id: 'rx', term: 'Rx', kind: 'shorthand', match: /\bRx\b/, plain: 'Prescription.' },
  { id: 'hx', term: 'Hx', kind: 'shorthand', match: /\bHx\b/, plain: 'History: past health events and background.' },
  { id: 'dx', term: 'Dx', kind: 'shorthand', match: /\bDx\b/, plain: 'The name a clinician gives to a health problem after assessing it.' },

  // ------------------------------------------------------------- clinical terms
  { id: 'mood-disorder', term: 'Mood disorder', kind: 'term', match: /\bmood disorder\b/i, plain: 'A general name for health conditions that mainly affect mood.' },
  { id: 'depressive-episode', term: 'Depressive episode', kind: 'term', match: /\bdepressive episode\b/i, plain: 'A stretch of time, usually at least two weeks, of low mood or lost interest most days.' },
  { id: 'depressed-mood', term: 'Depressed mood', kind: 'term', match: /\bdepressed mood\b/i, plain: 'Feeling low, sad, down or empty much of the time.' },
  { id: 'anergia', term: 'Anergia', kind: 'term', match: /\banergia\b/i, plain: 'Very low energy: feeling physically drained or without drive.' },
  { id: 'psychomotor', term: 'Psychomotor slowing', kind: 'term', match: /\bpsychomotor (?:slowing|retardation)\b/i, plain: 'Moving, speaking or thinking more slowly than usual.' },
  { id: 'somnolence', term: 'Somnolence', kind: 'term', match: /\bsomnolen(?:ce|t)\b/i, plain: 'Strong sleepiness or drowsiness, especially during the day.' },
  { id: 'sedation', term: 'Over-sedation', kind: 'term', match: /\b(?:over-?)?sedat(?:ion|ed)\b/i, plain: 'Feeling heavily drowsy, foggy or slowed down, often linked to a medication.' },
  {
    id: 'orthostatic-hypotension',
    term: 'Orthostatic hypotension',
    kind: 'term',
    match: /\borthostatic hypotension\b/i,
    plain: 'Blood pressure that drops when standing up. It can cause dizziness, lightheadedness or a "greying out" feeling on standing.',
  },
  { id: 'orthostatic', term: 'Orthostatic', kind: 'term', match: /\borthostatic\b/i, plain: 'Related to standing up: symptoms that come on when moving from sitting or lying to standing.' },
  { id: 'akathisia', term: 'Akathisia', kind: 'term', match: /\bakathisia\b/i, plain: 'A strong inner restlessness: feeling unable to sit still, often linked to some medications.' },
  { id: 'eps', term: 'Extrapyramidal symptoms', kind: 'term', match: /\b[Ee]xtrapyramidal\b|\bEPS\b/, plain: 'Movement changes such as shaking (tremor), stiffness (rigidity) or restlessness, sometimes linked to some medications.' },
  { id: 'tremor', term: 'Tremor', kind: 'term', match: /\btremors?\b/i, plain: 'Shaking that is hard to control, often in the hands.' },
  { id: 'rigidity', term: 'Rigidity', kind: 'term', match: /\brigidity\b/i, plain: 'Stiff muscles that are hard to move or relax.' },
  { id: 'blunting', term: 'Emotional blunting', kind: 'term', match: /\b(?:emotional )?blunting\b|\bblunted affect\b/i, plain: 'Feeling emotionally flat or numb: good and bad things both feel muted.' },
  { id: 'anhedonia', term: 'Anhedonia', kind: 'term', match: /\banhedonia\b/i, plain: 'Losing interest or pleasure in things that used to feel good.' },
  { id: 'racing-thoughts', term: 'Racing thoughts', kind: 'term', match: /\bracing thoughts\b/i, plain: 'Thoughts that move fast and are hard to slow down or switch off.' },
  { id: 'insomnia', term: 'Insomnia', kind: 'term', match: /\binsomnia\b|\bsleep(?:-onset)? disturbance\b/i, plain: 'Trouble falling asleep, staying asleep, or waking too early.' },
  { id: 'cognitive-dulling', term: 'Cognitive dulling', kind: 'term', match: /\bcognitive dulling\b|\bbrain fog\b/i, plain: 'Thinking feels slow or cloudy: harder to focus, remember or find words.' },
  { id: 'non-adherence', term: 'Non-adherence', kind: 'term', match: /\bnon-?adherence\b|\bnon-?compliance\b/i, plain: 'Not taking a medication the way it was prescribed, for any reason. Sharing it helps keep care safe.' },
  { id: 'autonomic', term: 'Autonomic symptoms', kind: 'term', match: /\bautonomic\b/i, plain: 'Body reactions that happen on their own, like a racing heart, sweating or shaky breathing.' },
  { id: 'metabolic', term: 'Metabolic', kind: 'term', match: /\bmetabolic\b/i, plain: 'About how the body uses food and energy: things like weight, blood sugar and cholesterol.' },
  { id: 'appetite-change', term: 'Appetite change', kind: 'term', match: /\bappetite change\b/i, plain: 'Eating noticeably more or less than usual.' },
  { id: 'anxiety-symptoms', term: 'Anxiety symptoms', kind: 'term', match: /\banxiety symptoms\b/i, plain: 'Worry, tension or feeling on edge, often with body signs like a fast heartbeat.' },
  { id: 'social-withdrawal', term: 'Social withdrawal', kind: 'term', match: /\bsocial withdrawal\b/i, plain: 'Pulling back from friends, family or activities.' },
  { id: 'dismissal', term: 'Patient-reported dismissal', kind: 'term', match: /\bpatient-reported dismissal\b/i, plain: 'The patient’s own account that a concern was brushed off at an earlier visit.' },
  { id: 'non-specific', term: 'Non-specific', kind: 'term', match: /\bnon-?specific\b/i, plain: 'Not pointing to one particular cause yet: worth exploring together.' },
  { id: 'side-effect', term: 'Side effect', kind: 'term', match: /\bside[- ]effects?\b/i, plain: 'An unwanted effect of a medication, beyond what it is meant to do.' },
  { id: 'titration', term: 'Titration', kind: 'term', match: /\btitrat(?:e|ed|ing|ion)\b/i, plain: 'Changing a medication’s amount gradually, step by step.' },
  { id: 'monitoring', term: 'Monitoring', kind: 'term', match: /\bmonitor(?:ing|ed)?\b/i, plain: 'Checking something again over time to see whether it changes.' },
  { id: 'blood-pressure', term: 'Blood pressure', kind: 'term', match: /\bblood pressure\b/i, plain: 'How hard blood pushes on the blood vessels, written as two numbers: the top one while the heart beats, the bottom one between beats.' },
  { id: 'weight-change', term: 'Weight change', kind: 'term', match: /\bweight change\b/i, plain: 'How much body weight went up or down over a stretch of time.' },
  { id: 'fasting-glucose', term: 'Fasting glucose', kind: 'term', match: /\bfasting (?:blood )?glucose\b/i, plain: 'Blood sugar measured after not eating, usually overnight.' },
  { id: 'cholesterol', term: 'Cholesterol', kind: 'term', match: /\bcholesterol\b/i, plain: 'A fat-like substance in the blood, measured in a blood test.' },
  { id: 'prolactin', term: 'Prolactin', kind: 'term', match: /\bprolactin\b/i, plain: 'A hormone measured in a blood test. Some medications can raise it.' },
];

export function plainFor(entry: GlossaryEntry, m: RegExpExecArray): string {
  return typeof entry.plain === 'function' ? entry.plain(m) : entry.plain;
}
