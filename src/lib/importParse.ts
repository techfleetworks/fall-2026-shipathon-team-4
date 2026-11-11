/**
 * B2 "We found · check before saving" — RULE-BASED split of pasted notes into
 * items the patient confirms one by one. Nothing is saved without a tick.
 * Reading photos/PDFs (OCR) comes later.
 */
import { todayISO, toISODate } from './dates';
import { matchSymptoms } from './translate';

export type FoundKind = 'Medication' | 'Symptom' | 'Side effect' | 'Other';

export interface FoundItem {
  id: string;
  text: string;
  /** YYYY-MM-DD, best guess */
  date: string;
  /** What the note said about the date, e.g. "Oct 30" or "June". */
  dateLabel?: string;
  kind: FoundKind;
  checked: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s+(\d{1,2}))?\b/i;
const NUMERIC_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const MED_RE = /\b\d+(\.\d+)?\s?(mg|mcg|ml)\b|\b(sertraline|fluoxetine|escitalopram|citalopram|paroxetine|bupropion|venlafaxine|duloxetine|mirtazapine|trazodone|ziprasidone|quetiapine|aripiprazole|lithium|lamotrigine|buspirone|hydroxyzine|propranolol)\b|\b(dose|started|stopped|switched|refill|prescri)/i;
const SIDE_RE = /\bafter (the |my )?(pills?|meds?|medicine|dose)\b|side effect|since (the |my )?(new )?(med|dose|pill)/i;
const SYMPTOM_RE = /sleep|tired|mood|sad|anxious|worr|panic|nause|dizz|headache|appetite|energy|cry|numb|focus|fog|shak|restless|lonely|empty/i;

/** Guess a date for a line. Future dates roll back a year (notes are about the past). */
function findDate(line: string): { date: string; label?: string } {
  const today = new Date();
  const m = line.match(MONTH_RE);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    const day = m[2] ? Number(m[2]) : 1;
    let d = new Date(today.getFullYear(), month, day);
    if (d > today) d = new Date(today.getFullYear() - 1, month, day);
    const label = m[2] ? `${m[1].slice(0, 3)} ${day}` : m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return { date: toISODate(d), label };
  }
  const n = line.match(NUMERIC_RE);
  if (n) {
    const month = Number(n[1]) - 1;
    const day = Number(n[2]);
    const year = n[3] ? (n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])) : today.getFullYear();
    let d = new Date(year, month, day);
    if (!n[3] && d > today) d = new Date(year - 1, month, day);
    if (!Number.isNaN(d.getTime())) return { date: toISODate(d), label: `${n[1]}/${n[2]}` };
  }
  return { date: todayISO() };
}

function kindOf(line: string): FoundKind {
  if (SIDE_RE.test(line)) return 'Side effect';
  if (MED_RE.test(line)) return 'Medication';
  if (matchSymptoms(line).length || SYMPTOM_RE.test(line)) return 'Symptom';
  return 'Other';
}

export function parseNotes(text: string): FoundItem[] {
  return text
    .split(/\n|;|•|(?<=\.)\s+(?=[A-Z])/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((l) => l.length > 2)
    .slice(0, 40)
    .map((line, i) => {
      const { date, label } = findDate(line);
      const kind = kindOf(line);
      return { id: `${i}-${line.slice(0, 12)}`, text: line, date, dateLabel: label, kind, checked: kind !== 'Other' };
    });
}
