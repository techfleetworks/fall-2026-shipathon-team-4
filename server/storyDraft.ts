/**
 * Server-side validation for the story sent to POST /api/prep-summary.
 *
 * The request comes from the public internet, so nothing in it is trusted. We build a brand-new draft from
 * only the fields we expect (unknown fields are dropped, which blocks mass assignment), check every type,
 * keep chip answers to the app's own choice lists, and cap every text length.
 */
import {
  FREQUENCY_CHOICES,
  IMPACT_CHOICES,
  ONSET_CHOICES,
  TRIED_CHOICES,
  TRIGGER_CHOICES,
} from '../src/lib/translate.js';
import type { FieldKey, StoryDraft } from '../src/lib/types.js';

/** Longest free-text answer accepted (about 800 words). */
export const MAX_ANSWER_CHARS = 5_000;
/** Medication name / dose / duration are short fields. */
export const MAX_SHORT_CHARS = 200;
/** A patient's rewrite of one summary line. */
export const MAX_OVERRIDE_CHARS = 1_000;

const FIELD_KEYS: readonly FieldKey[] = ['symptoms', 'onset', 'frequency', 'severity', 'triggers', 'tried'];

export type DraftResult = { ok: true; draft: StoryDraft } | { ok: false };

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function obj(v: unknown): Record<string, unknown> {
  if (!isObj(v)) throw new Invalid();
  return v;
}

function text(v: unknown, max = MAX_ANSWER_CHARS): string {
  if (v === undefined) return '';
  if (typeof v !== 'string' || v.length > max) throw new Invalid();
  return v;
}

function choice(v: unknown, allowed: readonly string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !allowed.includes(v)) throw new Invalid();
  return v;
}

function choices(v: unknown, allowed: readonly string[]): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > allowed.length) throw new Invalid();
  return [...new Set(v.map((c) => choice(c, allowed)!))];
}

/** Parse untrusted JSON into a clean StoryDraft, or reject it. Never throws. */
export function parseStoryDraft(input: unknown): DraftResult {
  try {
    const d = obj(input);
    const onset = obj(d.onset ?? {});
    const frequency = obj(d.frequency ?? {});
    const severity = obj(d.severity ?? {});
    const triggers = obj(d.triggers ?? {});
    const tried = obj(d.tried ?? {});

    let score: number | undefined;
    if (severity.score !== undefined && severity.score !== null) {
      if (typeof severity.score !== 'number' || !Number.isInteger(severity.score) || severity.score < 0 || severity.score > 10) {
        throw new Invalid();
      }
      score = severity.score;
    }
    if (onset.afterMedChange !== undefined && typeof onset.afterMedChange !== 'boolean') throw new Invalid();

    // The patient's own rewrites of a summary line ("Your doctor reads" → Edit). Only known lines are kept.
    const overrides: Partial<Record<FieldKey, string>> = {};
    if (d.overrides !== undefined && d.overrides !== null) {
      const o = obj(d.overrides);
      for (const key of FIELD_KEYS) if (o[key] !== undefined) overrides[key] = text(o[key], MAX_OVERRIDE_CHARS);
    }

    const draft: StoryDraft = {
      opening: text(d.opening),
      onset: { choice: choice(onset.choice, ONSET_CHOICES), text: text(onset.text), afterMedChange: onset.afterMedChange as boolean | undefined },
      frequency: { choice: choice(frequency.choice, FREQUENCY_CHOICES), text: text(frequency.text) },
      severity: { score, impacts: choices(severity.impacts, IMPACT_CHOICES), text: text(severity.text) },
      triggers: { choices: choices(triggers.choices, TRIGGER_CHOICES), text: text(triggers.text) },
      tried: {
        choices: choices(tried.choices, TRIED_CHOICES),
        medName: text(tried.medName, MAX_SHORT_CHARS),
        medDose: text(tried.medDose, MAX_SHORT_CHARS),
        medDuration: text(tried.medDuration, MAX_SHORT_CHARS),
        outcome: text(tried.outcome),
        text: text(tried.text),
      },
      ...(Object.keys(overrides).length ? { overrides } : {}),
    };
    return { ok: true, draft };
  } catch {
    return { ok: false };
  }
}
