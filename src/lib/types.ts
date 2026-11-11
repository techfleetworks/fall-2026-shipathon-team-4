export type ForWhom = 'myself';
export type Reason = string;

export interface ConsentPrefs {
  /** Required to use the app. */
  saveStory: boolean;
  makeSummaries: boolean;
  anonymousRatings: boolean;
}

export interface NotificationPrefs {
  prepReminders: boolean;
  morningOf: boolean;
  followUps: boolean;
}

export interface Profile {
  /** First name — used in greetings. */
  name: string;
  lastName?: string;
  email?: string;
  age?: number;
  forWhom: ForWhom;
  reasons: Reason[];
  brushedOff?: 'Yes' | 'Not sure' | 'No';
  consent?: ConsentPrefs;
  consentAccepted: boolean;
  /** PRD §3/§4: US adults 18+ only. */
  ageConfirmed?: boolean;
  /** Salted hash for the local-only log in. Never the password itself. */
  passwordHash?: { salt: string; hash: string };
  /** Ask for consent before every visit recording (defaults on). */
  askBeforeRecording?: boolean;
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

export type Answer3 = 'Yes' | 'A little' | 'No';

export interface CheckIn {
  feltHeard: number; // 1-5
  /** F2: "Was a next step agreed?" */
  nextStepAgreed?: 'Yes' | 'Not clear' | 'No';
  /** F2: "Did a playbook help?" */
  playbookHelped?: Answer3;
  /** Legacy (MVP check-in) */
  nextSteps?: NextStepKind[];
  dueDate?: string;
  scriptHelped?: Answer3;
  note?: string;
}

export interface FollowUp {
  id: string;
  visitId: string;
  /** What should happen, e.g. "Therapist referral" or "Start new medicine". */
  step: string;
  /** Who owns it: "You", the clinic, the doctor. */
  owner?: string;
  dueDate: string;
  /** Show a reminder on Home on the due date. */
  reminder?: boolean;
  /** A follow-up visit can be added to Visits straight from the list. */
  isVisit?: boolean;
  outcome?: 'Happened' | 'Not yet' | 'Didn’t happen';
  loggedAt?: string;
}

export interface Visit {
  id: string;
  date: string; // YYYY-MM-DD
  clinician?: string;
  specialty?: string;
  /** HH:MM, optional */
  time?: string;
  /** "What's this visit for?" */
  reason?: string;
  /** Talking points (top 3 priorities). */
  priorities: string[];
  askingFor: string[];
  /** Playbooks (script ids) to bring — B4. */
  scripts?: string[];
  /** B5 prep, per visit. */
  prep?: { feeling?: string; checks: string[]; extra: string[] };
  /** B6: marked once a link or PDF was made. */
  shared?: boolean;
  /** A2: consent outcome for capturing the visit. */
  recording?: 'agreed' | 'declined';
  /** A3: talking points ticked as covered. */
  covered?: string[];
  /** A3: quick notes typed during the visit. */
  notes?: string;
  /** F1: recap in plain words. */
  recap?: { doctorSaid: string[]; source: 'recording' | 'notes' | 'transcript'; updatedAt: string };
  checkIn?: CheckIn;
}

export interface SharedTip {
  id: string;
  createdAt: string;
  playbookId?: string;
  scriptId?: string;
  /** "Did it help?" rating for a playbook or script. */
  rating?: 'Yes' | 'A little' | 'No';
  text: string;
}

/** A playbook made for one visit (rule-based for now; AI later per the site map). */
export interface MyPlaybook {
  id: string;
  createdAt: string; // ISO
  visitId?: string;
  title: string;
  /** What to say first, built from the doctor-ready summary. */
  opening: string;
  priorities: string[];
  /** Scripts for likely pushback. */
  scriptIds: string[];
  askingFor: string[];
  /** Related others' playbook, if one matches. */
  peerPlaybookId?: string;
}

/** Frozen copy of the brief at the moment a link was made. */
export interface BriefSnapshot {
  who: string;
  /** B6 "Include" choices. Missing = both included. */
  includeTalkingPoints?: boolean;
  includeSummary?: boolean;
  visitDate?: string;
  priorities: string[];
  symptoms: { label: string; clinical: string; quote?: string }[];
  tried: string;
  timeline: { date: string; detail: string }[];
  askingFor: string[];
  demo: boolean;
}

export interface ShareLink {
  id: string;
  token: string;
  createdAt: string; // ISO
  expiresAt: string; // ISO
  revokedAt?: string;
  snapshot: BriefSnapshot;
}

export interface StoryDraft {
  opening: string;
  onset: { choice?: string; text: string; afterMedChange?: boolean };
  frequency: { choice?: string; text: string };
  severity: { score?: number; impacts: string[]; text: string };
  triggers: { choices: string[]; text: string };
  tried: { choices: string[]; medName: string; medDose: string; medDuration: string; outcome: string; text: string };
  /** B1: patient rewrites of a line on the "Your doctor reads" side. */
  overrides?: Partial<Record<FieldKey, string>>;
}
