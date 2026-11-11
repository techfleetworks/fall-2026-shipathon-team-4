/**
 * Transcript → "What the doctor said" (the Recap's recap.doctorSaid). Rule-based for now: the clinician's
 * own lines, in their words. Claude can later rewrite them in plain words behind the same function.
 *
 * These are quotes of what the clinician said, not claims made by the app, so they're shown as
 * "what the doctor said" and aren't run through the diagnosis/advice checks. Crisis is still checked first.
 */
import type { TranscriptPayload } from './types.js';

/** Most lines kept, and the longest single line. */
export const MAX_RECAP_LINES = 30;
export const MAX_RECAP_LINE_CHARS = 500;

const CLINICIAN_TITLE = /^(?:dr\.?|doctor|nurse|np|pa|rn|md|clinician|provider|therapist|psychiatrist|counselor)\b/i;

const sameName = (speaker: string, name: string) => {
  const s = speaker.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  return !!n && (s === n || s === n.split(/\s+/)[0] || s.split(/\s+/)[0] === n.split(/\s+/)[0]);
};

/**
 * Which speakers are the clinician(s). With the patient's name: everyone else. Without it: speakers whose
 * name starts with a clinical title ("Dr. Lane", "Nurse Kim"). Returns [] if it can't tell.
 */
export function clinicianSpeakers(payload: Pick<TranscriptPayload, 'speakers'>, patientName?: string): string[] {
  if (patientName && payload.speakers.some((s) => sameName(s, patientName))) {
    return payload.speakers.filter((s) => !sameName(s, patientName));
  }
  return payload.speakers.filter((s) => CLINICIAN_TITLE.test(s));
}

/** The clinician's lines, in order, de-duplicated and capped. */
export function doctorSaidFrom(payload: Pick<TranscriptPayload, 'speakers' | 'turns'>, patientName?: string): string[] {
  const clinicians = new Set(clinicianSpeakers(payload, patientName));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of payload.turns) {
    if (!t.speaker || !clinicians.has(t.speaker)) continue;
    const line = t.text.trim().slice(0, MAX_RECAP_LINE_CHARS);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    out.push(line);
    if (out.length >= MAX_RECAP_LINES) break;
  }
  return out;
}
