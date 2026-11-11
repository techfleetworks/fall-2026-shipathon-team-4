/**
 * Output checks (ticket B1): test what the engine produced against the behavior rules, before the
 * user sees it. Works on any engine text: today's rule-based translation, tomorrow's Claude output.
 *
 * Design choices (see ADR-004):
 *  - Sentences ending in "?" are questions for the clinician, which the rules ask for, so the
 *    diagnosis and advice checks skip them. Dosing and unreported-drug checks still apply.
 *  - Anything the user said themselves (their medication, their dose, a diagnosis they reported)
 *    may be echoed back. Only new claims are flagged.
 *  - Pattern-based: catches the common phrasings, not every possible one. The system prompt is
 *    the first line of defense; these checks are the backstop. Add a pattern whenever an eval
 *    finds a miss.
 */
import { hasCrisisLanguage } from '../safety.js';
import { CRISIS_SENTINEL, type GuardrailRuleId } from './rules.js';

export interface Violation {
  rule: GuardrailRuleId;
  reason: string;
  /** The part of the output that broke the rule. Internal use only: never log it (may contain health details). */
  excerpt: string;
}

export interface CheckContext {
  /** Everything the user provided for this request (story, transcript, notes). Used to allow echoes. */
  input: string;
  /** Clinical terms the engine is allowed to use (e.g. translation_pairs.csv). */
  approvedVocabulary?: readonly string[];
  /** The clinical terms the engine produced, when it returns them as a list (structured output). */
  clinicalTerms?: readonly string[];
}

export interface CheckResult {
  ok: boolean;
  violations: Violation[];
}

// ---------------------------------------------------------------- helpers

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/\s+/g, '');

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const isQuestion = (sentence: string) => /\?["”')\]]*$/.test(sentence);

/** True if the user already said this (so echoing it back is allowed). */
function userSaid(input: string, phrase: string): boolean {
  return squash(input).includes(squash(phrase));
}

function approved(vocab: readonly string[] | undefined, phrase: string): boolean {
  if (!vocab) return false;
  const p = norm(phrase);
  return vocab.some((term) => norm(term).includes(p));
}

// ---------------------------------------------------------------- rule: no diagnosis

/** Telling the user what they have. Checked on statements only (not questions). */
const DIAGNOSIS_STATEMENTS: RegExp[] = [
  /\byou(?:'ve| have| may have| might have| probably have| likely have| could have| definitely have| clearly have)\s+(?:got\s+)?(?:a |an )?[\w\s'-]{0,40}?\b(?:disorder|syndrome|disease|condition|illness|depression|anxiety|bipolar|adhd|ptsd|ocd|lupus|hyperthyroidism|hypothyroidism|hypotension|akathisia)\b/i,
  /\byou(?:'re| are)\s+(?:clearly |probably |likely |definitely )?(?:bipolar|depressed|manic|psychotic|schizophrenic|a hypochondriac|drug-seeking|non-?compliant)\b/i,
  /\byou(?:'re| are)? suffer(?:ing)? from\b/i,
  /\b(?:your|the) diagnosis (?:is|would be)\b/i,
  /\b(?:i|we) (?:would |can |could )?diagnose\b/i,
  /\b(?:this|it|that|these symptoms) (?:is|are|sounds? like|looks? like|seems? like|is probably|is likely|is clearly|points? to|indicates?) (?:a |an )?(?:case of |sign of )?[\w\s'-]{0,30}?\b(?:disorder|syndrome|disease|lupus|bipolar|mania|hyperthyroidism|hypothyroidism)\b/i,
];

/** Condition names. Flagged in a statement unless the user reported them or they're approved vocabulary. */
const CONDITION_NAMES =
  /\b(?:major depressive disorder|bipolar(?: disorder| i| ii)?|generali[sz]ed anxiety disorder|panic disorder|schizo\w+|ptsd|adhd|ocd|lupus|sle|hyperthyroidism|hypothyroidism|borderline personality disorder|personality disorder|serotonin syndrome|neuroleptic malignant syndrome|tardive dyskinesia|orthostatic hypotension|[a-z-]+ disorder|[a-z-]+ syndrome)\b/gi;

// ---------------------------------------------------------------- rule: no medical advice

const ADVICE_STATEMENTS: RegExp[] = [
  /\byou should\b(?!\s+(?:ask|mention|bring|tell|note|raise|write|track|share|let|feel))/i,
  /\byou (?:need|ought|have|must) to (?:take|stop|start|increase|decrease|reduce|lower|raise|change|switch|skip|double|quit|cut|wean)\b/i,
  /\b(?:i|we) (?:would )?(?:recommend|suggest|advise|prescribe)\b/i,
  /\b(?:try|consider|start|stop|keep|avoid) (?:taking|using|stopping|starting|increasing|decreasing|lowering|reducing|switching|skipping|cutting)\b/i,
  /^(?:take|stop|start|increase|decrease|reduce|lower|raise|switch|skip|double|halve|cut|quit)\s+(?:taking\s+)?(?:your |the |this |that |it |a |an )?(?:medication|meds|medicine|dose|dosage|pills?|prescription|tablets?)\b/i,
  /\b(?:don't|do not|never) (?:take|stop taking|skip|start taking)\b/i,
  /\bit(?:'s| is) (?:safe|fine|okay|ok|better) to (?:stop|take|skip|increase|decrease|double|cut|switch)\b/i,
];

// ---------------------------------------------------------------- rule: no dosing / no drug recommendations

const DOSE_AMOUNTS = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|units?|iu|tablets?|pills?|capsules?)\b/gi;
const DOSE_SCHEDULES = /\b(?:(?:once|twice|three times|four times|\d+\s*(?:x|times))\s+(?:a|per|each|every)\s+(?:day|night|week)|every \d+ hours|at bedtime|before bed)\b/gi;

/** Common medications. Flagged when the engine names one the user didn't. Not exhaustive: see ADR-004. */
const MEDICATIONS =
  /\b(?:ziprasidone|geodon|sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|bupropion|wellbutrin|venlafaxine|effexor|desvenlafaxine|duloxetine|cymbalta|mirtazapine|remeron|trazodone|vortioxetine|trintellix|vilazodone|quetiapine|seroquel|aripiprazole|abilify|olanzapine|zyprexa|risperidone|risperdal|lurasidone|latuda|cariprazine|vraylar|brexpiprazole|rexulti|haloperidol|clozapine|lithium|lamotrigine|lamictal|valproate|depakote|divalproex|carbamazepine|clonazepam|klonopin|lorazepam|ativan|alprazolam|xanax|diazepam|valium|buspirone|hydroxyzine|propranolol|gabapentin|pregabalin|zolpidem|ambien|melatonin|modafinil|methylphenidate|ritalin|adderall|amphetamine|atomoxetine|levothyroxine|methimazole|hydroxychloroquine|plaquenil|prednisone|ibuprofen|acetaminophen|tylenol|naproxen|ketamine|esketamine|spravato)\b/gi;

// ---------------------------------------------------------------- the check

export function checkOutput(output: string, ctx: CheckContext): CheckResult {
  const violations: Violation[] = [];
  const add = (rule: GuardrailRuleId, reason: string, excerpt: string) => violations.push({ rule, reason, excerpt });

  // Crisis takes priority: the model's crisis reply, or crisis language anywhere in the output.
  if (output.includes(CRISIS_SENTINEL)) add('crisis-priority', 'Engine flagged crisis language', CRISIS_SENTINEL);
  else if (hasCrisisLanguage(output)) add('crisis-priority', 'Crisis language in the output', '');

  // Curly apostrophes (common in AI output) become straight ones so the patterns match "you’re" etc.
  for (const sentence of sentencesOf(output.replace(/[’‘]/g, "'"))) {
    const question = isQuestion(sentence);

    if (!question) {
      for (const re of DIAGNOSIS_STATEMENTS) {
        const m = re.exec(sentence);
        if (m && !userSaid(ctx.input, m[0])) add('no-diagnosis', 'Tells the user what condition they have', m[0]);
      }
      for (const m of sentence.matchAll(CONDITION_NAMES)) {
        if (!userSaid(ctx.input, m[0]) && !approved(ctx.approvedVocabulary, m[0])) {
          add('no-diagnosis', 'Names a condition the user did not report', m[0]);
        }
      }
      for (const re of ADVICE_STATEMENTS) {
        const m = re.exec(sentence);
        if (m) add('no-medical-advice', 'Gives a treatment instruction or recommendation', m[0]);
      }
    }

    for (const re of [DOSE_AMOUNTS, DOSE_SCHEDULES]) {
      for (const m of sentence.matchAll(re)) {
        if (!userSaid(ctx.input, m[0])) add('no-dosing', 'Gives a dose or schedule the user did not report', m[0]);
      }
    }
    for (const m of sentence.matchAll(MEDICATIONS)) {
      if (!userSaid(ctx.input, m[0])) add('no-dosing', 'Names a medication the user did not report', m[0]);
    }
  }

  // Honest uncertainty: structured clinical terms must come from the approved vocabulary.
  if (ctx.clinicalTerms && ctx.approvedVocabulary) {
    for (const term of ctx.clinicalTerms) {
      if (norm(term) === 'not discussed') continue;
      if (!ctx.approvedVocabulary.some((v) => norm(v) === norm(term))) {
        add('honest-uncertainty', 'Uses a clinical term outside the approved vocabulary', term);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
