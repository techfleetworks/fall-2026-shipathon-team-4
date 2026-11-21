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
  /** The visit this story was told for (Name how I feel). Missing on stories saved before visits had their own. */
  visitId?: string;
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
  /** 1-5. Missing when the person skipped it (every check-in question is optional). */
  feltHeard?: number;
  /** F2: "Was a next step agreed?" */
  nextStepAgreed?: 'Yes' | 'Not clear' | 'No';
  /** F2: "Did a tip help?" */
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
  /** When the visit was added (ISO). Only stories saved after this count toward its Before steps. Missing on older visits. */
  createdAt?: string;
  clinician?: string;
  /** V2: the doctor's email, for the patient's own reference (nothing is sent to it). */
  clinicianEmail?: string;
  /** V2: hospital or clinic the doctor works at. */
  affiliation?: string;
  /** Type of doctor: a preset ("Primary care"…) or what the patient typed under "Other". */
  specialty?: string;
  /** HH:MM, optional */
  time?: string;
  /** "What's this visit for?" */
  reason?: string;
  /** Notes for your doctor: what family, friends or coworkers have noticed. Patient-written. */
  othersNoticed?: string;
  /** Talking points, most important first. */
  priorities: string[];
  askingFor: string[];
  /** Playbooks (script ids) to bring — B4. */
  scripts?: string[];
  /** B5 prep, per visit. `feeling` is the old single pick; read it through `prepFeelings()`. */
  prep?: { feelings?: string[]; feeling?: string; checks: string[]; extra: string[] };
  /** B6: marked once a link or PDF was made. */
  shared?: boolean;
  /**
   * Before-the-visit steps (by slug) the person finished: Continue clicked with an answer, or (Notes for your
   * doctor) opened. Visits made before this existed don't have it and use the older answer-only ticks.
   */
  stepsDone?: string[];
  /** A2: consent outcome for capturing the visit. */
  recording?: 'agreed' | 'declined';
  /** A3: talking points ticked as covered. */
  covered?: string[];
  /** A3: quick notes typed during the visit. */
  notes?: string;
  /**
   * A3: words captured live while recording, saved as each piece is finished (ADR-021), so nothing is lost if the page
   * closes mid-visit. Moved into `recap` on Stop (or the next time the screen opens).
   */
  live?: { segments: string[]; updatedAt: string };
  /** F1: recap in plain words. */
  recap?: { doctorSaid: string[]; source: 'recording' | 'notes' | 'transcript'; updatedAt: string };
  /** Plain-language after-visit summary from the transcript or notes (ADR-011): raised / said / plan / not covered. */
  afterVisit?: import('./afterVisit/summary').AfterVisitSummary;
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
  /** "Name, age" for the D1 title. Missing on links made before it existed. */
  patient?: string;
  /** D1 "Daily impact", from the severity answer. */
  impact?: string;
  timeline: { date: string; detail: string }[];
  askingFor: string[];
  demo: boolean;
  /** The shareable record (ADR-020): the case in doctor terms, frozen when the link was made. Only if the patient included it. */
  case?: CaseSnapshot;
}

/** The case as the doctor reads it (Case view, ADR-017), frozen into a shared brief. Clinical lines only, no ids. */
export interface CaseSnapshot {
  presenting: string[];
  course: string[];
  medications: string[];
  /** Patterns across visits, in doctor terms ("Symptom onset … Temporal association only."). */
  patterns: string[];
  /** Still open: overdue follow-ups, talking points never addressed. */
  openItems: string[];
  keyDates: { date: string; text: string }[];
  /** Past visits, oldest first. */
  visits: { date: string; clinician?: string; feltHeard?: number }[];
}

export interface ShareLink {
  id: string;
  token: string;
  createdAt: string; // ISO
  expiresAt: string; // ISO. Far in the future (NEVER_EXPIRES) when the person chose "No expiration date".
  /** "No expiration date": works until the person stops sharing. */
  neverExpires?: boolean;
  revokedAt?: string;
  snapshot: BriefSnapshot;
}

/** expiresAt for a link with no expiration date, so every "still active?" check keeps working unchanged. */
export const NEVER_EXPIRES = '9999-12-31T23:59:59.000Z';

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
