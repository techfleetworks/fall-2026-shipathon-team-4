/**
 * Rule-based "See it in doctor terms" engine.
 *
 * Vocabulary comes from the Starter Pack's translation_pairs.csv (plain <-> clinical),
 * plus a few common depression/anxiety terms. Every clinical line keeps the patient's
 * own words next to it (PRD F3). Missing fields say "Not discussed" — nothing is made up.
 *
 * Guardrail (PRD §6.0): we only translate symptoms into terms. We never say the
 * patient HAS a condition and never suggest medication changes.
 */
import type { FieldKey, StoryDraft, SummaryField } from './types.js';
// .js extension: this file also runs on the server (Node ES modules); Vite maps it to .ts.
import { DISCLAIMERS } from './guardrails/copy.js';

interface Pair {
  match: RegExp;
  clinical: string;
}

// Order matters only for display; all matches are collected.
export const TRANSLATION_PAIRS: Pair[] = [
  { match: /crawl out of my skin|can'?t sit still|restless|pacing/i, clinical: 'Akathisia (inner restlessness, often medication-related)' },
  { match: /zombie|drows(y|iness)|sleepy|sedat|groggy|falling asleep|nod(ding)? off/i, clinical: 'Over-sedation / excessive daytime somnolence' },
  { match: /\bflat\b|numb|nothing touches me|can'?t feel anything/i, clinical: 'Emotional blunting / blunted affect' },
  { match: /hands? shak|shaky|tremor|\bstiff/i, clinical: 'Extrapyramidal symptoms (tremor, rigidity)' },
  { match: /can'?t get out of bed|everything (is|feels) heavy|no energy|exhausted|drained|wiped out/i, clinical: 'Psychomotor slowing; low energy (anergia)' },
  { match: /mind won'?t stop|racing thoughts|thoughts (are )?racing/i, clinical: 'Racing thoughts' },
  { match: /\bdown\b|low mood|\bsad\b|depress|hopeless|empty/i, clinical: 'Depressed mood' },
  { match: /lost interest|nothing (is )?fun|don'?t enjoy|no joy|stopped caring/i, clinical: 'Anhedonia (loss of interest or pleasure)' },
  { match: /can'?t (fall )?sleep|up at \d|awake at night|insomnia|wake up (at|in the middle)/i, clinical: 'Insomnia; sleep disturbance' },
  { match: /fog|forget|can'?t (focus|concentrate|think)/i, clinical: 'Cognitive dulling ("brain fog")' },
  { match: /dizzy|light-?headed|room tilts|stand(ing)? up/i, clinical: 'Orthostatic symptoms — dizziness on standing (possible low blood pressure on standing)' },
  { match: /stopped taking|skipp(ed|ing) (my )?(meds|doses|pills)/i, clinical: 'Medication non-adherence (shared for safety, not blame)' },
  { match: /heart (races|racing|pounds|pounding)|sweaty|panic/i, clinical: 'Autonomic / panic-type symptoms' },
  { match: /gain(ed)? (a lot of )?weight|weight gain|put on weight/i, clinical: 'Weight gain (metabolic change)' },
  { match: /appetite|not eating|eating (too much|more|less)/i, clinical: 'Appetite change' },
  { match: /worr(y|ied|ying)|anxious|on edge|nervous|can'?t relax/i, clinical: 'Excessive worry / anxiety symptoms' },
  { match: /all in my head|dramatic|just the depression|just anxiety|brushed off|dismiss/i, clinical: 'Patient-reported dismissal at a previous visit' },
  { match: /don'?t feel like myself/i, clinical: 'Non-specific change from usual self (worth exploring with your clinician)' },
];

export const ONSET_CHOICES = ['Less than 2 weeks', '2–4 weeks', '1–3 months', '3–6 months', 'More than 6 months'];
export const FREQUENCY_CHOICES = ['Every day', 'A few times a week', 'Weekly', 'Comes and goes'];
export const IMPACT_CHOICES = ['Work or school', 'Sleep', 'Relationships', 'Taking care of myself', 'Getting around'];
export const TRIGGER_CHOICES = ['After a dose', 'Standing up', 'Stress', 'Mornings', 'Evenings', 'Not sure'];
export const TRIED_CHOICES = ['Medication', 'Therapy', 'Sleep changes', 'Exercise', 'Nothing yet'];

const ONSET_CLINICAL: Record<string, string> = {
  'Less than 2 weeks': '< 2 weeks',
  '2–4 weeks': '2–4 weeks',
  '1–3 months': '~1–3 months',
  '3–6 months': '~3–6 months',
  'More than 6 months': '> 6 months',
};

const FREQUENCY_CLINICAL: Record<string, string> = {
  'Every day': 'Daily (7 days / week)',
  'A few times a week': '3–5 days / week',
  Weekly: '~1 day / week',
  'Comes and goes': 'Episodic / intermittent',
};

/** Pull an explicit "8 months" / "5 weeks" from free text. */
function durationFromText(text: string): string | undefined {
  const m = text.match(/(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month|year)s?/i);
  if (!m) return undefined;
  const words: Record<string, string> = { a: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
  const n = words[m[1].toLowerCase()] ?? m[1];
  return `${n} ${m[2].toLowerCase()}${n === '1' ? '' : 's'}`;
}

export function matchSymptoms(text: string): string[] {
  const found = new Set<string>();
  for (const p of TRANSLATION_PAIRS) if (p.match.test(text)) found.add(p.clinical);
  return [...found];
}

const quoteOf = (...parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(' · ') || undefined;

export function translateStory(d: StoryDraft): SummaryField[] {
  const allText = [d.opening, d.onset.text, d.frequency.text, d.severity.text, d.triggers.text, d.tried.text, d.tried.outcome].join(' ');
  const symptoms = matchSymptoms(allText);

  // Onset
  const explicit = durationFromText(d.onset.text) ?? durationFromText(d.opening);
  let onset = explicit ?? (d.onset.choice ? ONSET_CLINICAL[d.onset.choice] : undefined);
  if (onset && d.onset.afterMedChange) onset += ', began after a medication change';
  else if (!onset && d.onset.afterMedChange) onset = 'Began after a medication change';
  if (onset && /month|year|> 6|3–6|1–3|2–4/.test(onset) && symptoms.includes('Depressed mood')) {
    onset += ' (≥ 2 weeks)';
  }

  // Frequency
  const frequency = d.frequency.choice ? FREQUENCY_CLINICAL[d.frequency.choice] : undefined;

  // Severity
  let severity: string | undefined;
  if (d.severity.score !== undefined) {
    severity = `${d.severity.score}/10`;
    if (d.severity.impacts.length) severity += `, affects daily function (${d.severity.impacts.join(', ').toLowerCase()})`;
  } else if (d.severity.impacts.length) {
    severity = `Affects daily function (${d.severity.impacts.join(', ').toLowerCase()})`;
  }

  // Triggers
  const trig = d.triggers.choices.filter((c) => c !== 'Not sure');
  const triggers = trig.length ? `Worse with: ${trig.join(', ').toLowerCase()}` : d.triggers.choices.includes('Not sure') ? 'No clear trigger identified' : undefined;

  // Tried
  const triedParts: string[] = [];
  if (d.tried.medName) {
    triedParts.push([d.tried.medName, d.tried.medDose, d.tried.medDuration && `for ${d.tried.medDuration}`, d.tried.outcome && `— ${d.tried.outcome}`].filter(Boolean).join(' '));
  }
  for (const c of d.tried.choices) if (c !== 'Medication' && c !== 'Nothing yet') triedParts.push(c);
  if (d.tried.choices.includes('Nothing yet') && !triedParts.length) triedParts.push('No prior treatment');
  const tried = triedParts.join('; ') || undefined;

  const f = (key: FieldKey, label: string, clinical: string | undefined, quote?: string): SummaryField => ({
    key,
    label,
    clinical: clinical ?? 'Not discussed',
    quote,
  });

  return [
    f('symptoms', 'Symptoms', symptoms.length ? symptoms.join('; ') : undefined, d.opening.trim() || undefined),
    f('onset', 'Onset', onset, quoteOf(d.onset.choice, d.onset.text)),
    f('frequency', 'Frequency', frequency, quoteOf(d.frequency.choice, d.frequency.text)),
    f('severity', 'Severity', severity, quoteOf(d.severity.text)),
    f('triggers', 'Triggers', triggers, quoteOf(d.triggers.text)),
    f('tried', 'Tried', tried, quoteOf(d.tried.text)),
  ];
}

// Product's exact short disclaimer (Copy Drafts §3), kept in one place: src/lib/guardrails/copy.ts.
export const DISCLAIMER = DISCLAIMERS.short.body;
