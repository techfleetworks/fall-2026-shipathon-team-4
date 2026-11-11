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
  NotificationPrefs,
  MyPlaybook,
  ShareLink,
} from './types';
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
  /** False after "Log out". Data stays on the device until deleted. */
  signedIn?: boolean;
  notifications: NotificationPrefs;
  myPlaybooks: MyPlaybook[];
  shareLinks: ShareLink[];
}

interface AppActions {
  completeOnboarding: (p: Omit<Profile, 'onboarded'>, nextVisit?: { date: string; clinician?: string; specialty?: string }) => void;
  updateProfile: (p: Partial<Profile>) => void;
  setNextVisit: (date: string | undefined, clinician?: string, specialty?: string) => void;
  saveSummary: (s: Omit<CaseSummary, 'id' | 'createdAt'>) => void;
  addEvidence: (e: Omit<Evidence, 'id'>) => void;
  deleteEvidence: (id: string) => void;
  addMedication: (m: Omit<Medication, 'id'>) => void;
  deleteMedication: (id: string) => void;
  addVisit: (v: { date: string; time?: string; clinician?: string; specialty?: string; reason?: string }) => string;
  addFollowUp: (f: Omit<FollowUp, 'id'>) => void;
  updateFollowUp: (id: string, patch: Partial<FollowUp>) => void;
  deleteFollowUp: (id: string) => void;
  updateVisit: (id: string, patch: Partial<Visit>) => void;
  deleteVisit: (id: string) => void;
  submitCheckIn: (visitId: string, c: CheckIn) => void;
  logFollowUp: (id: string, outcome: NonNullable<FollowUp['outcome']>) => void;
  toggleScript: (id: string) => void;
  addTip: (t: Omit<SharedTip, 'id' | 'createdAt'>) => void;
  setMorning: (m: Partial<MorningPrep>) => void;
  setTextScale: (n: number) => void;
  signOut: () => void;
  signIn: () => void;
  setNotifications: (p: Partial<NotificationPrefs>) => void;
  savePlaybook: (p: Omit<MyPlaybook, 'id' | 'createdAt'>) => string;
  deletePlaybook: (id: string) => void;
  createShareLink: (snapshot: ShareLink['snapshot'], days: number) => ShareLink;
  revokeShareLink: (id: string) => void;
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
  signedIn: true,
  notifications: { prepReminders: true, morningOf: true, followUps: true },
  myPlaybooks: [],
  shareLinks: [],
};

export const useApp = create<AppData & AppActions>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      completeOnboarding: (p, nextVisit) => {
        set({ profile: { ...p, onboarded: true } });
        if (nextVisit) get().setNextVisit(nextVisit.date, nextVisit.clinician, nextVisit.specialty);
      },

      updateProfile: (p) => set((s) => ({ profile: s.profile ? { ...s.profile, ...p } : s.profile })),

      setNextVisit: (date, clinician, specialty) =>
        set((s) => {
          const upcoming = selectUpcomingVisit(s);
          if (!date) return { visits: s.visits.filter((v) => v !== upcoming) };
          if (upcoming) {
            return { visits: s.visits.map((v) => (v === upcoming ? { ...v, date, clinician: clinician ?? v.clinician, specialty: specialty ?? v.specialty } : v)) };
          }
          return {
            visits: [...s.visits, { id: uid(), date, clinician, specialty, priorities: defaultPriorities(s), askingFor: [] }],
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

      addVisit: (v) => {
        const id = uid();
        // Only the next upcoming visit inherits talking points from the latest story.
        set((s) => ({ visits: [...s.visits, { id, ...v, priorities: v.date >= todayISO() ? defaultPriorities(s) : [], askingFor: [] }] }));
        return id;
      },
      addFollowUp: (f) => set((s) => ({ followUps: [...s.followUps, { ...f, id: uid() }] })),
      updateFollowUp: (id, patch) => set((s) => ({ followUps: s.followUps.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFollowUp: (id) => set((s) => ({ followUps: s.followUps.filter((f) => f.id !== id) })),

      updateVisit: (id, patch) => set((s) => ({ visits: s.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      deleteVisit: (id) =>
        set((s) => ({ visits: s.visits.filter((v) => v.id !== id), followUps: s.followUps.filter((f) => f.visitId !== id) })),

      submitCheckIn: (visitId, c) =>
        set((s) => {
          const visit = s.visits.find((v) => v.id === visitId);
          const agreed = c.nextStepAgreed === 'Yes' ? 'next step agreed' : c.nextStepAgreed === 'Not clear' ? 'next step not clear' : 'no next step';
          const detail = `Felt heard ${c.feltHeard}/5 · ${agreed}`;
          const already = s.evidence.some((e) => e.type === 'visit' && e.date === visit?.date && e.detail.startsWith('Felt heard'));
          return {
            visits: s.visits.map((v) => (v.id === visitId ? { ...v, checkIn: c } : v)),
            evidence: already
              ? s.evidence.map((e) => (e.type === 'visit' && e.date === visit?.date && e.detail.startsWith('Felt heard') ? { ...e, detail } : e))
              : [...s.evidence, { id: uid(), date: visit?.date ?? todayISO(), type: 'visit', title: 'Visit', detail }],
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

      signOut: () => {
        set({ signedIn: false });
        useDraft.getState().reset();
      },
      signIn: () => set({ signedIn: true }),

      setNotifications: (p) => set((s) => ({ notifications: { ...EMPTY.notifications, ...s.notifications, ...p } })),

      savePlaybook: (p) => {
        const id = uid();
        set((s) => ({ myPlaybooks: [...(s.myPlaybooks ?? []), { ...p, id, createdAt: new Date().toISOString() }] }));
        return id;
      },
      deletePlaybook: (id) => set((s) => ({ myPlaybooks: (s.myPlaybooks ?? []).filter((p) => p.id !== id) })),

      createShareLink: (snapshot, days) => {
        const now = new Date();
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        const link: ShareLink = {
          id: uid(),
          token,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
          snapshot,
        };
        set((s) => ({ shareLinks: [...(s.shareLinks ?? []), link] }));
        return link;
      },
      revokeShareLink: (id) =>
        set((s) => ({ shareLinks: (s.shareLinks ?? []).map((l) => (l.id === id ? { ...l, revokedAt: new Date().toISOString() } : l)) })),

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
      },
    }),
    {
      name: 'get-heard',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v2: caregiver access removed from the product — drop any stored invites.
      migrate: (persisted) => {
        const { caregivers: _drop, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return rest as unknown as AppData & AppActions;
      },
    },
  ),
);

const STORAGE_KEY = 'get-heard';

// ---------- selectors ----------

/** Has an account on this device AND hasn't logged out. */
export const selectSignedIn = (s: Pick<AppData, 'profile' | 'signedIn'>) => !!s.profile?.onboarded && s.signedIn !== false;
/** An account exists on this device (signed in or not). */
export const selectHasAccount = (s: Pick<AppData, 'profile'>) => !!s.profile?.onboarded;

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

export function isLinkActive(l: ShareLink, now = Date.now()): boolean {
  return !l.revokedAt && new Date(l.expiresAt).getTime() > now;
}

export function selectDueFollowUps(s: Pick<AppData, 'followUps'>): FollowUp[] {
  const today = todayISO();
  // Only steps with a reminder on (older data has no flag, so it counts as on).
  return s.followUps.filter((f) => !f.outcome && f.reminder !== false && f.dueDate <= today);
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
