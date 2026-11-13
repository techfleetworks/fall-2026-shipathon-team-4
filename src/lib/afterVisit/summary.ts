/**
 * Plain-language after-visit summary (board card, ADR-011). Input: the visit transcript (recorded and
 * transcribed, or Theo's transcript.txt), or the patient's quick notes when there was no recording.
 * Output, in short sentences at about a 6th-grade reading level:
 *   youRaised   what the patient brought up
 *   doctorSaid  what the clinician said, rewritten in plain words (clinical words → patient words, reverse pairs)
 *   plan        what happens next, as the clinician said it
 *   notCovered  what the patient raised that the clinician never talked about, and talking points that never came up
 *
 * Free and rule-based (no AI): it recognizes common visit patterns ("it's probably the depression", "give it
 * time", "we'll reassess next month"). A sentence it can't rewrite is quoted, never guessed. It reports what was
 * said and never judges it; every sentence still goes through the guardrails (no diagnosis, advice or doses).
 */
import { guardResponse, type Violation } from '../guardrails/index.js';
import { hasCrisisLanguage } from '../safety.js';
import { clinicianSpeakers } from '../transcript/recap.js';
import type { TranscriptPayload } from '../transcript/types.js';
import { matchSymptoms } from '../translate.js';
import { readingGrade, TARGET_GRADE } from './readability.js';
import { REVERSE_PAIRS, toPlainWords, type ReversePair } from './reversePairs.js';

export interface AfterVisitSummary {
  source: 'transcript' | 'notes';
  youRaised: string[];
  doctorSaid: string[];
  plan: string[];
  notCovered: string[];
  /** Things the clinician said they or the clinic would do, e.g. "Run a thyroid panel" (for action items, ADR-013). */
  promised: string[];
  talkingPoints: { text: string; raised: boolean }[];
  /** Flesch-Kincaid grade of the summary's own sentences (quotes excluded). */
  readingGrade: number;
  meetsReadingTarget: boolean;
  /** For summaries made from a visit's notes: which notes they came from, so the app re-runs only when they change. */
  basedOn?: string;
}

export type AfterVisitResult =
  | { status: 'ok'; summary: AfterVisitSummary }
  | { status: 'crisis' }
  | { status: 'blocked'; message: string; violations: Violation[] };

/** Splits into sentences, but not after a title ("Dr. Kim", "Mrs. Lee"). */
const sentencesOf = (text: string) => text.split(/(?<!\b(?:Dr|Mr|Mrs|Ms|Mx|St)\.)(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const uniq = (xs: string[]) => [...new Set(xs)];

/** "It's probably the depression" → "depression". */
const CAUSE = /\b(?:probably|likely|just|put it down to|it'?s|blame it on)\s+(?:the\s+|your\s+)?(depression|anxiety|stress|your mood|mood|age|hormones|in your head)\b/i;
const POSSIBLE = /\b(?:possible|could be|might be|may be)\b/i;
const COMMON = /\bcore symptom\b|\bcommon (?:sign|symptom|with)\b|\bpart of (?:the )?(?:depression|anxiety)\b/i;
const ADJUST = /\b(?:body|you)\b.*\b(?:adjusts?|get used to|settle)\b/i;
const WAIT = /\bgive it (?:some )?time\b|\bwait and see\b|\blet'?s wait\b/i;
const NO_CHANGE = /\bpush through\b|\bkeep going\b|\bstay the course\b|\bsame dose\b|\bno change\b|\bcontinue (?:the|your) (?:current )?(?:dose|medication|meds)\b/i;
const FOLLOW_UP = /\breassess\b|\bre-?check\b|\bcheck (?:it |back |in )?again\b|\bfollow[- ]?up\b|\bsee you\b|\bcome back\b/i;
/** In notes: "She will order a blood test", "Dr. Kim is going to refer me", "they'll call me". */
const NOTES_PROMISE = /\b(?:she|he|they|the doctor|the clinic|the nurse|dr\.? ?[a-z]+)(?:'ll| will| is going to| are going to)\s+(order|send|run|schedule|refer me|book|call me|recheck|check|test|get)\b\s*([^.?!]*)/i;
/** "I'll order a blood test", "let us run an ECG": something the clinician or clinic will do. */
const PROMISE = /\b(?:I'?ll|I will|we'?ll|we will|let'?s|let us)\s+(order|send|run|schedule|refer you|book|call you|recheck|check|test|get)\b\s*([^.?!]*)/i;
const WHEN = /\b(next (?:week|month|visit)|in (?:\d+|a few|one|two|three|four|six) (?:days?|weeks?|months?))\b/i;
const MED_TIMING = /\b(?:started|began|since)\b[^.?!]*\b(?:dose|medication|meds|medicine)\b[^.?!]*\b(?:change|changed|increase|went up)\b|\bsince we upped\b|\bright after the dose\b/i;
const MED_WORD = /\b(?:medication|medicine|meds|dose|pills?)\b/i;

/** Pairs that came up in this text, in plain words (patient side) or clinical words (doctor side, notes). */
function pairsIn(text: string): ReversePair[] {
  const vocab = matchSymptoms(text);
  return REVERSE_PAIRS.filter((p) => vocab.includes(p.vocab) || p.jargon.test(text));
}

/**
 * A doctor task as a short noun, like the app's own next-step names ("Blood test", "Therapist referral"):
 * "order a blood test" → "Blood test", "refer me to a therapist" → "Referral to a therapist".
 */
export function taskName(verb: string, rest: string): string {
  const v = verb.toLowerCase();
  const obj = rest.trim().replace(/\s+today$/i, '').replace(/[.!?]+$/, '').replace(/^(?:me\s+)?(?:an?|the|some)\s+/i, '');
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  if (v.startsWith('refer')) return obj ? `Referral ${obj.replace(/^me\s+/i, '')}` : 'Referral';
  if (v.startsWith('call')) return obj ? `Call ${obj}` : 'Call from the clinic';
  if (!obj) return cap(v);
  return cap(obj);
}

function talkedAbout(pair: ReversePair, doctorText: string): boolean {
  return pair.topic.test(doctorText) || pair.jargon.test(doctorText);
}

function pointRaised(point: string, patientText: string, raised: ReversePair[]): boolean {
  const pairs = pairsIn(point);
  if (pairs.some((p) => raised.includes(p))) return true;
  const words = new Set((point.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !['about', 'since', 'there', 'their', 'which', 'would', 'could', 'should'].includes(w)));
  const hits = [...words].filter((w) => patientText.toLowerCase().includes(w));
  return hits.length >= 2;
}

function planFrom(text: string): string[] {
  const plan: string[] = [];
  for (const s of sentencesOf(text)) {
    if (WAIT.test(s)) plan.push('Wait and see for now.');
    if (NO_CHANGE.test(s)) plan.push('No change for now.');
    if (FOLLOW_UP.test(s)) {
      const when = WHEN.exec(s)?.[1];
      plan.push(when ? `Check again ${when.toLowerCase()}.` : 'Check again at your next visit.');
    }
  }
  return uniq(plan);
}

function finish(summary: Omit<AfterVisitSummary, 'readingGrade' | 'meetsReadingTarget'>, input: string): AfterVisitResult {
  const own = [...summary.youRaised, ...summary.doctorSaid, ...summary.plan, ...summary.notCovered]
    .map((s) => s.replace(/“[^”]*”/g, '').trim())
    .filter(Boolean)
    .join(' ');
  const grade = readingGrade(own);
  const all = [...summary.youRaised, ...summary.doctorSaid, ...summary.plan, ...summary.notCovered].join('\n');
  const guarded = guardResponse(all, { input });
  if (guarded.status !== 'ok') return guarded;
  return { status: 'ok', summary: { ...summary, readingGrade: grade, meetsReadingTarget: grade <= TARGET_GRADE } };
}

/** Summary from a transcript (speaker turns). */
export function summarizeVisit(
  payload: Pick<TranscriptPayload, 'speakers' | 'turns'>,
  { patientName, talkingPoints = [] }: { patientName?: string; talkingPoints?: readonly string[] } = {},
): AfterVisitResult {
  const allText = payload.turns.map((t) => t.text).join('\n');
  if (hasCrisisLanguage(allText, ...talkingPoints)) return { status: 'crisis' };

  const clinicians = new Set(clinicianSpeakers(payload, patientName));
  const dialogue = payload.turns.filter((t) => t.speaker);
  // No "Name: words" dialogue was recognized: summarize the text like notes rather than return nothing.
  if (!dialogue.length || !clinicians.size) return summarizeNotes(allText, { talkingPoints });
  const patientTurns = dialogue.filter((t) => !clinicians.has(t.speaker!)).map((t) => t.text);
  const doctorTurns = dialogue.filter((t) => clinicians.has(t.speaker!)).map((t) => t.text);
  const patientText = patientTurns.join('\n');
  const doctorText = doctorTurns.join('\n');

  // What the patient raised (plain → clinical with the app's own pairs, then said back in patient words).
  const raised = pairsIn(patientText);
  const askedAboutMeds = patientTurns.some((t) => t.includes('?') && MED_WORD.test(t));
  const youRaised = [
    ...raised.map((p) => `You talked about ${p.plain}.`),
    ...(MED_TIMING.test(patientText) ? ['You said it started after the medicine dose changed.'] : []),
    ...(askedAboutMeds ? ['You asked if the medicine could be causing this.'] : []),
  ];

  // What the doctor said, in plain words.
  const doctorSaid: string[] = [];
  const promised: string[] = [];
  let cause: string | undefined;
  for (const s of doctorTurns.flatMap(sentencesOf)) {
    const c = CAUSE.exec(s)?.[1]?.toLowerCase().replace(/^your /, '');
    if (c) cause = c;
    if (c && POSSIBLE.test(s)) {
      doctorSaid.push(askedAboutMeds ? `The doctor said the medicine could be the cause, but still thinks it is the ${c}.` : `The doctor said other causes are possible, but still thinks it is the ${c}.`);
    } else if (c) {
      doctorSaid.push(c === 'in your head' ? 'The doctor did not find a body cause for this.' : `The doctor thinks this is from the ${c}.`);
    } else if (COMMON.test(s) && cause) {
      doctorSaid.push(`The doctor said this is common with ${cause}.`);
    } else if (ADJUST.test(s)) {
      doctorSaid.push(`The doctor thinks your body will get used to the medicine${/\bfew weeks\b/i.test(s) ? ' in a few weeks' : ''}.`);
    } else if (PROMISE.test(s) && !FOLLOW_UP.test(s)) {
      const m = PROMISE.exec(s)!;
      const task = toPlainWords(`${m[1]} ${m[2]}`.trim()).replace(/\s+today$/i, '');
      promised.push(taskName(m[1], toPlainWords(m[2])));
      doctorSaid.push(`The doctor will ${task}.`);
    } else if (WAIT.test(s) || NO_CHANGE.test(s) || FOLLOW_UP.test(s)) {
      // Plan sentences go to "plan".
    } else if ((s.match(/[A-Za-z]+/g) ?? []).length >= 4) {
      doctorSaid.push(`The doctor also said: “${toPlainWords(s)}”`);
    }
  }

  const notCovered = [
    ...raised.filter((p) => !talkedAbout(p, doctorText)).map((p) => `The doctor did not talk about ${p.plain}.`),
  ];
  const points = talkingPoints.map((text) => ({ text, raised: pointRaised(text, patientText, raised) }));
  for (const p of points) if (!p.raised) notCovered.push(`This talking point did not come up: ${p.text}.`);

  return finish(
    { source: 'transcript', youRaised: uniq(youRaised), doctorSaid: uniq(doctorSaid), plan: planFrom(doctorText), notCovered: uniq(notCovered), promised: uniq(promised), talkingPoints: points },
    `${allText}\n${talkingPoints.join('\n')}`,
  );
}

/** Summary from the patient's quick notes, when the visit wasn't recorded. */
export function summarizeNotes(notes: string, { talkingPoints = [] }: { talkingPoints?: readonly string[] } = {}): AfterVisitResult {
  if (hasCrisisLanguage(notes, ...talkingPoints)) return { status: 'crisis' };
  // One item per line AND per sentence: people often type several points on one line.
  const lines = notes.split(/\n+/).flatMap((l) => sentencesOf(l.replace(/^[-•*]\s*/, '').trim())).filter(Boolean);
  const plan = planFrom(lines.join('. '));
  const doctorSaid = lines.filter((l) => !WAIT.test(l) && !NO_CHANGE.test(l) && !FOLLOW_UP.test(l)).map((l) => `Your notes: ${toPlainWords(l)}`);
  // Notes describe the doctor in the third person: "She will order a blood test", "Dr. Kim will refer me".
  const promised = uniq(lines.flatMap((l) => {
    const m = NOTES_PROMISE.exec(l);
    if (!m) return [];
    return [taskName(m[1], toPlainWords(m[2]))];
  }));
  const raisedPairs = pairsIn(notes);
  const points = talkingPoints.map((text) => ({ text, raised: pointRaised(text, notes, raisedPairs) }));
  return finish(
    { source: 'notes', youRaised: [], doctorSaid, plan, notCovered: points.filter((p) => !p.raised).map((p) => `This talking point is not in your notes: ${p.text}.`), promised, talkingPoints: points },
    `${notes}\n${talkingPoints.join('\n')}`,
  );
}
