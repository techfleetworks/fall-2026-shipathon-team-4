/**
 * Local-first storage. Everything lives on this device only (localStorage).
 * The in-progress story draft is session-only (sessionStorage): raw inputs are
 * discarded when the tab closes, per ADR-001 Decision 5. Only what the patient
 * approves ("Looks right — save to my case") is kept.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addDays, todayISO, uid } from './dates';
import type {
  CaseSummary,
  CheckIn,
  Evidence,
  FollowUp,
  Medication,
  Profile,
  SharedTip,
  StoryDraft,
  Visit,
} from './types';
import type { TranscriptPayload } from './transcript/types';
import { buildDemoState } from '../data/demo';

export interface MorningPrep {
  date: string;
  feeling?: string;
  checks: string[];
}

export interface AppData {
  profile: Profile | null;
  demoMode: boolean;
  medications: Medication[];
  summaries: CaseSummary[];
  evidence: Evidence[];
  visits: Visit[];
  followUps: FollowUp[];
  savedScripts: string[];
  sharedTips: SharedTip[];
  morning?: MorningPrep;
  textScale: number;
}

interface AppActions {
  completeOnboarding: (p: Omit<Profile, 'onboarded'>, nextVisit?: string) => void;
  updateProfile: (p: Partial<Profile>) => void;
  setNextVisit: (date: string | undefined, clinician?: string) => void;
  saveSummary: (s: Omit<CaseSummary, 'id' | 'createdAt'>) => void;
  addEvidence: (e: Omit<Evidence, 'id'>) => void;
  deleteEvidence: (id: string) => void;
  addMedication: (m: Omit<Medication, 'id'>) => void;
  deleteMedication: (id: string) => void;
  updateVisit: (id: string, patch: Partial<Visit>) => void;
  deleteVisit: (id: string) => void;
  submitCheckIn: (visitId: string, c: CheckIn) => void;
  saveVisitTranscript: (visitId: string, t: TranscriptPayload) => void;
  logFollowUp: (id: string, outcome: NonNullable<FollowUp['outcome']>) => void;
  toggleScript: (id: string) => void;
  addTip: (t: Omit<SharedTip, 'id' | 'createdAt'>) => void;
  setMorning: (m: Partial<MorningPrep>) => void;
  setTextScale: (n: number) => void;
  loadDemo: () => void;
  deleteEverything: () => void;
}

const EMPTY: AppData = {
  profile: null,
  demoMode: false,
  medications: [],
  summaries: [],
  evidence: [],
  visits: [],
  followUps: [],
  savedScripts: [],
  sharedTips: [],
  textScale: 1,
};

export const useApp = create<AppData & AppActions>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      completeOnboarding: (p, nextVisit) => {
        set({ profile: { ...p, onboarded: true } });
        if (nextVisit) get().setNextVisit(nextVisit);
      },

      updateProfile: (p) => set((s) => ({ profile: s.profile ? { ...s.profile, ...p } : s.profile })),

      setNextVisit: (date, clinician) =>
        set((s) => {
          const upcoming = selectUpcomingVisit(s);
          if (!date) return { visits: s.visits.filter((v) => v !== upcoming) };
          if (upcoming) {
            return { visits: s.visits.map((v) => (v === upcoming ? { ...v, date, clinician: clinician ?? v.clinician } : v)) };
          }
          return {
            visits: [...s.visits, { id: uid(), date, clinician, priorities: defaultPriorities(s), askingFor: [] }],
          };
        }),

      saveSummary: (sum) =>
        set((s) => {
          const summary: CaseSummary = { ...sum, id: uid(), createdAt: new Date().toISOString() };
          const symptoms = sum.fields.find((f) => f.key === 'symptoms');
          const evidence: Evidence = {
            id: uid(),
            date: todayISO(),
            type: 'symptom',
            title: 'Story saved',
            detail: symptoms && symptoms.clinical !== 'Not discussed' ? symptoms.clinical : 'Doctor-ready summary updated',
          };
          const summaries = [...s.summaries, summary];
          // Refresh brief priorities on the upcoming visit if the patient hasn't customised them.
          const upcoming = selectUpcomingVisit(s);
          const visits = upcoming && upcoming.priorities.length === 0
            ? s.visits.map((v) => (v === upcoming ? { ...v, priorities: defaultPriorities({ ...s, summaries }) } : v))
            : s.visits;
          return { summaries, evidence: [...s.evidence, evidence], visits };
        }),

      addEvidence: (e) => set((s) => ({ evidence: [...s.evidence, { ...e, id: uid() }] })),
      deleteEvidence: (id) => set((s) => ({ evidence: s.evidence.filter((e) => e.id !== id) })),

      addMedication: (m) =>
        set((s) => ({
          medications: [...s.medications, { ...m, id: uid() }],
          evidence: [
            ...s.evidence,
            { id: uid(), date: m.started, type: 'medication', title: 'Medication', detail: `${m.name}${m.dose ? ` ${m.dose}` : ''} started${m.note ? ` — ${m.note}` : ''}` },
          ],
        })),
      deleteMedication: (id) => set((s) => ({ medications: s.medications.filter((m) => m.id !== id) })),

      updateVisit: (id, patch) => set((s) => ({ visits: s.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      deleteVisit: (id) =>
        set((s) => ({ visits: s.visits.filter((v) => v.id !== id), followUps: s.followUps.filter((f) => f.visitId !== id) })),

      submitCheckIn: (visitId, c) =>
        set((s) => {
          const visit = s.visits.find((v) => v.id === visitId);
          const steps = c.nextSteps.filter((n) => n !== 'None given');
          const followUps: FollowUp[] = c.dueDate
            ? steps.map((step) => ({ id: uid(), visitId, step, dueDate: c.dueDate! }))
            : [];
          const detail = [
            `Felt heard ${c.feltHeard}/5`,
            steps.length ? steps.join(', ').toLowerCase() + ' promised' : 'no clear next step',
          ].join(' · ');
          return {
            visits: s.visits.map((v) => (v.id === visitId ? { ...v, checkIn: c } : v)),
            followUps: [...s.followUps, ...followUps],
            evidence: [...s.evidence, { id: uid(), date: visit?.date ?? todayISO(), type: 'visit', title: 'Visit', detail }],
          };
        }),

      // ADR-001 Decision 5: the raw transcript is session-only. Its text goes to the session store
      // (sessionStorage, gone when the tab closes); only a short, text-free note is kept in My case.
      saveVisitTranscript: (visitId, t) =>
        set((s) => {
          const visit = s.visits.find((v) => v.id === visitId);
          if (!visit) return {};
          const replacing = !!useVisitTranscripts.getState().byVisit[visitId];
          useVisitTranscripts.getState().put(visitId, t);
          const who = t.speakers.length ? ` · ${t.speakers.join(', ')}` : '';
          return {
            evidence: [
              ...s.evidence,
              {
                id: uid(),
                date: visit.date,
                type: 'visit',
                title: replacing ? 'Visit transcript replaced' : 'Visit transcript reviewed',
                detail: `${t.stats.dialogueTurns} lines of conversation${who} · text kept for that session only`,
              },
            ],
          };
        }),

      logFollowUp: (id, outcome) =>
        set((s) => {
          const f = s.followUps.find((x) => x.id === id);
          if (!f) return {};
          return {
            followUps: s.followUps.map((x) => (x.id === id ? { ...x, outcome, loggedAt: todayISO() } : x)),
            evidence: [
              ...s.evidence,
              { id: uid(), date: todayISO(), type: 'follow-up', title: 'Follow-up', detail: `${f.step} (due ${f.dueDate}): ${outcome.toLowerCase()}` },
            ],
          };
        }),

      toggleScript: (id) =>
        set((s) => ({ savedScripts: s.savedScripts.includes(id) ? s.savedScripts.filter((x) => x !== id) : [...s.savedScripts, id] })),

      addTip: (t) => set((s) => ({ sharedTips: [...s.sharedTips, { ...t, id: uid(), createdAt: new Date().toISOString() }] })),

      setMorning: (m) =>
        set((s) => {
          const today = todayISO();
          const base = s.morning?.date === today ? s.morning : { date: today, checks: [] };
          return { morning: { ...base, ...m } };
        }),

      setTextScale: (textScale) => set({ textScale }),

      loadDemo: () => set((s) => ({ ...EMPTY, textScale: s.textScale, ...buildDemoState() })),

      deleteEverything: () => {
        set({ ...EMPTY });
        try {
          localStorage.removeItem(STORAGE_KEY);
          sessionStorage.clear();
        } catch {
          /* storage unavailable */
        }
        useDraft.getState().reset();
        useVisitTranscripts.getState().reset();
      },
    }),
    {
      name: 'get-heard',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v2: raw transcripts no longer live on visits (ADR-001 Decision 5). Drop any saved by an earlier build.
      migrate: (persisted, version) => {
        const state = persisted as AppData;
        if (version < 2 && Array.isArray(state?.visits)) {
          state.visits = state.visits.map((v) => {
            const { transcript: _dropped, ...rest } = v as Visit & { transcript?: unknown };
            return rest;
          });
        }
        return state;
      },
    },
  ),
);

const STORAGE_KEY = 'get-heard';

// ---------- selectors ----------

export function selectUpcomingVisit(s: Pick<AppData, 'visits'>): Visit | undefined {
  const today = todayISO();
  return [...s.visits]
    .filter((v) => !v.checkIn && v.date >= addDays(today, -3))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** The most recent visit that happened but has no check-in yet. */
export function selectVisitNeedingCheckIn(s: Pick<AppData, 'visits'>): Visit | undefined {
  const today = todayISO();
  return [...s.visits]
    .filter((v) => !v.checkIn && v.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function selectLatestSummary(s: Pick<AppData, 'summaries'>): CaseSummary | undefined {
  return s.summaries[s.summaries.length - 1];
}

export function selectDueFollowUps(s: Pick<AppData, 'followUps'>): FollowUp[] {
  const today = todayISO();
  return s.followUps.filter((f) => !f.outcome && f.dueDate <= today);
}

function defaultPriorities(s: Pick<AppData, 'summaries'>): string[] {
  const latest = selectLatestSummary(s);
  const sym = latest?.fields.find((f) => f.key === 'symptoms');
  if (!sym || sym.clinical === 'Not discussed') return [];
  return sym.clinical.split('; ').slice(0, 3);
}

// ---------- session-only story draft ----------

export const emptyDraft = (): StoryDraft => ({
  opening: '',
  onset: { text: '' },
  frequency: { text: '' },
  severity: { impacts: [], text: '' },
  triggers: { choices: [], text: '' },
  tried: { choices: [], medName: '', medDose: '', medDuration: '', outcome: '', text: '' },
});

interface DraftState {
  draft: StoryDraft;
  update: (patch: Partial<StoryDraft>) => void;
  reset: () => void;
}

export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      draft: emptyDraft(),
      update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      reset: () => set({ draft: emptyDraft() }),
    }),
    { name: 'get-heard-draft', storage: createJSONStorage(() => sessionStorage) },
  ),
);

// ---------- session-only visit transcripts ----------

/**
 * Raw "In the room" transcripts, keyed by visit ID. Session-only (ADR-001 Decision 5): held in
 * sessionStorage so a page refresh keeps them, and discarded when the tab closes. Never in localStorage.
 * Later, the approved after-visit summary built from a transcript is what gets kept.
 */
interface VisitTranscriptState {
  byVisit: Record<string, TranscriptPayload>;
  put: (visitId: string, t: TranscriptPayload) => void;
  remove: (visitId: string) => void;
  reset: () => void;
}

export const useVisitTranscripts = create<VisitTranscriptState>()(
  persist(
    (set) => ({
      byVisit: {},
      put: (visitId, t) => set((s) => ({ byVisit: { ...s.byVisit, [visitId]: t } })),
      remove: (visitId) =>
        set((s) => {
          const { [visitId]: _removed, ...rest } = s.byVisit;
          return { byVisit: rest };
        }),
      reset: () => set({ byVisit: {} }),
    }),
    { name: 'get-heard-visit-transcripts', storage: createJSONStorage(() => sessionStorage) },
  ),
);
