/**
 * Translation pairs, the other way round (ADR-011). The Starter Pack's translation_pairs.csv runs
 * plain → clinical (patient to doctor, used by "See it in doctor terms"). The after-visit summary runs
 * clinical → plain (doctor to patient), so each pair here gives:
 *   - `jargon`: how a clinician might say it (to find it in what the doctor said)
 *   - `topic`:  words showing the subject came up at all (to tell whether the doctor talked about it)
 *   - `plain`:  the patient-side words, as "you …" (to say it back in the summary)
 * Every one of the 15 Starter Pack pairs and every approved term in translate.ts is covered (tested).
 * Wording is a draft for Product (Dominic) to review.
 */

export interface ReversePair {
  id: string;
  /** The approved term in src/lib/translate.ts this pair belongs to. */
  vocab: string;
  /** The clinical term as written in translation_pairs.csv, when the Starter Pack has one. */
  csv?: string;
  jargon: RegExp;
  topic: RegExp;
  /** Patient-side words, short, 6th-grade level. Reads after "about …" and "you …". */
  plain: string;
}

export const REVERSE_PAIRS: readonly ReversePair[] = [
  { id: 'akathisia', vocab: 'Akathisia (inner restlessness, often medication-related)', csv: 'Akathisia (often medication-induced)', jargon: /\bakathisia\b|\binner restlessness\b/i, topic: /restless|can'?t sit still|akathisia|pacing|crawl out of my skin/i, plain: 'feeling like you can’t sit still' },
  { id: 'sedation', vocab: 'Over-sedation / excessive daytime somnolence', csv: 'Over-sedation / excessive somnolence', jargon: /\b(?:excessive (?:daytime )?)?somnolen\w*|\b(?:over-?)?sedat(?:ion|ed)\b/i, topic: /sleep|drows|tired|energy|sedat|somnolen|groggy|zombie|fatigue/i, plain: 'feeling very sleepy in the day' },
  { id: 'blunting', vocab: 'Emotional blunting / blunted affect', csv: 'Emotional blunting / blunted affect', jargon: /\b(?:emotional )?blunting\b|\bblunted affect\b/i, topic: /\bflat\b|numb|blunt|nothing touches/i, plain: 'feeling flat, like nothing touches you' },
  { id: 'eps', vocab: 'Extrapyramidal symptoms (tremor, rigidity)', csv: 'Extrapyramidal symptoms (tremor, rigidity)', jargon: /\bextrapyramidal(?: symptoms)?\b|\bEPS\b|\btremors?\b|\brigidity\b/i, topic: /shak|tremor|stiff|rigid/i, plain: 'shaky hands and stiff muscles' },
  { id: 'anergia', vocab: 'Psychomotor slowing, low energy (anergia)', csv: 'Psychomotor retardation; low energy (anergia)', jargon: /\bpsychomotor (?:slowing|retardation)\b|\banergia\b/i, topic: /energy|heavy|out of bed|slowed|anergia|exhaust|drained/i, plain: 'feeling tired, like your body is heavy' },
  { id: 'racing', vocab: 'Racing thoughts', csv: 'Racing thoughts', jargon: /\bracing thoughts\b|\bflight of ideas\b/i, topic: /racing|mind won'?t stop/i, plain: 'thoughts that race and won’t stop' },
  { id: 'mood', vocab: 'Depressed mood', csv: 'Depressive episode (duration >= 2 weeks)', jargon: /\bdepressive episode\b|\bdepressed mood\b|\bdysthymi\w*/i, topic: /depress|\bdown\b|low mood|\bsad\b/i, plain: 'feeling down for weeks' },
  { id: 'anhedonia', vocab: 'Anhedonia (loss of interest or pleasure)', jargon: /\banhedonia\b/i, topic: /interest|enjoy|pleasure|anhedonia|\bfun\b/i, plain: 'losing interest in things you used to enjoy' },
  { id: 'insomnia', vocab: 'Insomnia / sleep disturbance', csv: 'Insomnia; sleep-onset disturbance', jargon: /\binsomnia\b|\bsleep[- ]onset (?:disturbance|insomnia)\b|\bsleep disturbance\b/i, topic: /can'?t sleep|fall asleep|insomnia|awake at|up at \d|stay asleep/i, plain: 'not sleeping well' },
  { id: 'fog', vocab: 'Cognitive dulling ("brain fog")', csv: 'Cognitive dulling ("brain fog")', jargon: /\bcognitive (?:dulling|slowing|impairment)\b/i, topic: /fog|forget|focus|concentrat/i, plain: 'a foggy mind that forgets things' },
  { id: 'orthostatic', vocab: 'Orthostatic symptoms — dizziness on standing (possible low blood pressure on standing)', csv: 'Orthostatic hypotension (low BP on standing)', jargon: /\borthostatic(?: hypotension| symptoms)?\b|\bpostural (?:hypotension|drop)\b/i, topic: /dizz|lightheaded|light-headed|blood pressure|\bBP\b|stand|faint|orthostatic|room tilts/i, plain: 'feeling dizzy when you stand up' },
  { id: 'adherence', vocab: 'Medication non-adherence (shared for safety, not blame)', csv: 'Medication non-adherence', jargon: /\b(?:medication )?non-?adheren\w*|\bnon-?complian\w*/i, topic: /stopped taking|skip|adheren|complian/i, plain: 'not taking the medicine the way it was prescribed' },
  { id: 'autonomic', vocab: 'Autonomic / panic-type symptoms', csv: 'Autonomic / panic-type symptoms', jargon: /\bautonomic(?: symptoms)?\b|\bpanic-type symptoms\b/i, topic: /heart (?:races|racing|pound)|sweat|panic|autonomic/i, plain: 'a racing heart and sweating' },
  { id: 'weight', vocab: 'Weight gain (metabolic change)', csv: 'Metabolic side effect', jargon: /\bmetabolic (?:side effects?|changes?|parameters)\b/i, topic: /weight|metabolic/i, plain: 'gaining weight on the medicine' },
  { id: 'appetite', vocab: 'Appetite change', jargon: /\bappetite changes?\b/i, topic: /appetite|eating/i, plain: 'eating more or less than usual' },
  { id: 'worry', vocab: 'Excessive worry / anxiety symptoms', jargon: /\banxiety symptoms\b|\bexcessive worry\b/i, topic: /worr|anxious|on edge|nervous|anxiety/i, plain: 'worrying a lot and feeling on edge' },
  { id: 'dismissal', vocab: 'Patient-reported dismissal at a previous visit', csv: 'Patient-reported dismissal', jargon: /\bpatient-reported dismissal\b/i, topic: /all in my head|dramatic|brushed off|dismiss/i, plain: 'feeling brushed off at a past visit' },
  { id: 'withdrawal', vocab: 'Social withdrawal', jargon: /\bsocial withdrawal\b/i, topic: /friends|isolat|withdraw|pull(?:ing|ed) away/i, plain: 'pulling away from people' },
  { id: 'nonspecific', vocab: 'Non-specific change from usual self (worth exploring with your clinician)', csv: 'Non-specific — ask the app to help name it', jargon: /\bnon-?specific\b/i, topic: /feel like myself|not myself/i, plain: 'not feeling like yourself' },
];

export const pairForVocab = (vocab: string) => REVERSE_PAIRS.find((p) => p.vocab === vocab);

/** Replaces clinical words the doctor used with the patient-side words (e.g. "orthostatic hypotension" → "feeling dizzy when you stand up"). */
export function toPlainWords(text: string): string {
  let out = text;
  for (const p of REVERSE_PAIRS) out = out.replace(new RegExp(p.jargon.source, `${p.jargon.flags.replace('g', '')}g`), p.plain);
  return out;
}
