export type ForWhom = 'myself' | 'someone';
export type Reason = 'Low mood' | 'Worry' | 'Both' | 'Not sure';

export interface Profile {
  name: string;
  age?: number;
  forWhom: ForWhom;
  reasons: Reason[];
  consentAccepted: boolean;
  onboarded: boolean;
}

/** One line of the doctor-ready summary. `clinical` is what the doctor reads; `quote` is the patient's own words. */
export interface SummaryField {
  key: FieldKey;
  label: string;
  clinical: string;
  quote?: string;
  /** True when the patient rewrote the clinical line. Patient's words always win. */
  editedByPatient?: boolean;
}

export type FieldKey = 'symptoms' | 'onset' | 'frequency' | 'severity' | 'triggers' | 'tried';

export interface CaseSummary {
  id: string;
  createdAt: string; // ISO
  opening: string; // "You said"
  fields: SummaryField[];
}

export type EvidenceType = 'visit' | 'medication' | 'symptom' | 'note' | 'follow-up';

export interface Evidence {
  id: string;
  date: string; // YYYY-MM-DD
  type: EvidenceType;
  title: string;
  detail: string;
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  started: string; // YYYY-MM-DD
  note?: string;
}

export type NextStepKind = 'Referral' | 'Test' | 'Med change' | 'Follow-up visit' | 'None given';

export interface CheckIn {
  feltHeard: number; // 1-5
  nextSteps: NextStepKind[];
  dueDate?: string;
  scriptHelped?: 'Yes' | 'A little' | 'No';
  note?: string;
}

export interface FollowUp {
  id: string;
  visitId: string;
  step: NextStepKind;
  dueDate: string;
  outcome?: 'Happened' | 'Not yet' | 'Didn’t happen';
  loggedAt?: string;
}

export interface Visit {
  id: string;
  date: string; // YYYY-MM-DD
  clinician?: string;
  priorities: string[];
  askingFor: string[];
  checkIn?: CheckIn;
  // No raw transcript here: transcripts are session-only (ADR-001 Decision 5), see useVisitTranscripts.
}

export interface SharedTip {
  id: string;
  createdAt: string;
  playbookId?: string;
  scriptId?: string;
  text: string;
}

export interface StoryDraft {
  opening: string;
  onset: { choice?: string; text: string; afterMedChange?: boolean };
  frequency: { choice?: string; text: string };
  severity: { score?: number; impacts: string[]; text: string };
  triggers: { choices: string[]; text: string };
  tried: { choices: string[]; medName: string; medDose: string; medDuration: string; outcome: string; text: string };
}
