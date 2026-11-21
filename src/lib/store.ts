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
import { NEVER_EXPIRES } from './types';
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
  completeOnboarding: (p: Omit<Profile, 'onboarded'>, nextVisit?: { date: string; time?: string; clinician?: string; clinicianEmail?: string; affiliation?: string; specialty?: string; reason?: string }) => void;
  updateProfile: (p: Partial<Profile>) => void;
  setNextVisit: (date: string | undefined, clinician?: string, specialty?: string) => void;
  saveSummary: (s: Omit<CaseSummary, 'id' | 'createdAt'>) => void;
  /** Name how I feel emptied: this visit no longer has a story (the history log keeps its "Story saved" entries). */
  clearVisitSummaries: (v: Pick<Visit, 'id' | 'createdAt'>) => void;
  /** Returns the new entry's id. */
  addEvidence: (e: Omit<Evidence, 'id'>) => string;
  deleteEvidence: (id: string) => void;
  updateEvidence: (id: string, patch: Partial<Omit<Evidence, 'id'>>) => void;
  addMedication: (m: Omit<Medication, 'id'>) => void;
  deleteMedication: (id: string) => void;
  addVisit: (v: { date: string; time?: string; clinician?: string; clinicianEmail?: string; affiliation?: string; specialty?: string; reason?: string }) => string;
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
  /** The link lasts `days` from `startsAt` (e.g. the visit date), or from now if that is later or not given. */
  /** `days` 0 = no expiration date (works until the person stops sharing). */
  createShareLink: (snapshot: ShareLink['snapshot'], days: number, startsAt?: Date) => ShareLink;
  revokeShareLink: (id: string) => void;
  /** Fills the app with Theo's demo data: from the server when given (ADR-010), else the built-in copy. */
  loadDemo: (data?: Partial<AppData>) => void;
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
        if (nextVisit) {
          get().setNextVisit(nextVisit.date, nextVisit.clinician, nextVisit.specialty);
          // The rest of the O7 details go on that same visit.
          const { time, clinicianEmail, affiliation, reason } = nextVisit;
          const v = selectUpcomingVisit(get());
          if (v && v.date === nextVisit.date) get().updateVisit(v.id, { time, clinicianEmail, affiliation, reason });
        }
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
            visits: [...s.visits, { id: uid(), date, clinician, specialty, priorities: defaultPriorities(s), askingFor: [], stepsDone: [] }],
          };
        }),

      clearVisitSummaries: (v) =>
        set((s) => ({ summaries: s.summaries.filter((sum) => !isVisitStory(sum, s.visits, v)) })),

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

      addEvidence: (e) => {
        const id = uid();
        set((s) => ({ evidence: [...s.evidence, { ...e, id }] }));
        return id;
      },
      deleteEvidence: (id) => set((s) => ({ evidence: s.evidence.filter((e) => e.id !== id) })),
      updateEvidence: (id, patch) => set((s) => ({ evidence: s.evidence.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

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
        // A new visit starts empty: every Before step is still to do.
        set((s) => ({ visits: [...s.visits, { id, ...v, createdAt: new Date().toISOString(), priorities: [], askingFor: [], stepsDone: [] }] }));
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
          const agreed = c.nextStepAgreed === 'Yes' ? 'next step agreed' : c.nextStepAgreed === 'Not clear' ? 'next step not clear' : c.nextStepAgreed === 'No' ? 'no next step' : undefined;
          // Questions can be skipped: only what was answered goes in the history line.
          const detail = [c.feltHeard ? `Felt heard ${c.feltHeard}/5` : 'Check-in', agreed].filter(Boolean).join(' · ');
          const isCheckInLine = (d: string) => d.startsWith('Felt heard') || d.startsWith('Check-in');
          const already = s.evidence.some((e) => e.type === 'visit' && e.date === visit?.date && isCheckInLine(e.detail));
          return {
            visits: s.visits.map((v) => (v.id === visitId ? { ...v, checkIn: c } : v)),
            evidence: already
              ? s.evidence.map((e) => (e.type === 'visit' && e.date === visit?.date && isCheckInLine(e.detail) ? { ...e, detail } : e))
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

      createShareLink: (snapshot, days, startsAt) => {
        const now = new Date();
        const start = startsAt && startsAt.getTime() > now.getTime() ? startsAt : now;
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        const link: ShareLink = {
          id: uid(),
          token,
          createdAt: now.toISOString(),
          expiresAt: days > 0 ? new Date(start.getTime() + days * 86_400_000).toISOString() : NEVER_EXPIRES,
          ...(days > 0 ? {} : { neverExpires: true }),
          snapshot,
        };
        set((s) => ({ shareLinks: [...(s.shareLinks ?? []), link] }));
        return link;
      },
      revokeShareLink: (id) =>
        set((s) => ({ shareLinks: (s.shareLinks ?? []).map((l) => (l.id === id ? { ...l, revokedAt: new Date().toISOString() } : l)) })),

      loadDemo: (data) => set((s) => ({ ...EMPTY, textScale: s.textScale, ...(data ?? buildDemoState()), demoMode: true })),

      deleteEverything: () => {
        set({ ...EMPTY });
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(SYNC_STORAGE_KEY); // sync turned off too, so nothing is pulled back
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
/** Visit store sync settings (src/lib/sync/index.ts SYNC_STORAGE_KEY; kept here to avoid a circular import, tested equal). */
export const SYNC_STORAGE_KEY = 'get-heard-sync';

// ---------- selectors ----------

/** Has an account on this device AND hasn't logged out. */
export const selectSignedIn = (s: Pick<AppData, 'profile' | 'signedIn'>) => !!s.profile?.onboarded && s.signedIn !== false;
/** An account exists on this device (signed in or not). */
/**
 * Which visit a story belongs to: the one it was saved for. Older stories without that link belong to the
 * visit added most recently before them, or to no particular visit if they came before any of those.
 */
function storyOwner(sum: CaseSummary, visits: Pick<Visit, 'id' | 'createdAt'>[]): string | undefined {
  if (sum.visitId) return sum.visitId;
  let owner: Pick<Visit, 'id' | 'createdAt'> | undefined;
  for (const v of visits) {
    if (v.createdAt && v.createdAt <= sum.createdAt && (!owner || v.createdAt > owner.createdAt!)) owner = v;
  }
  return owner?.id;
}

/**
 * The latest story told for this visit, or undefined (an empty Name how I feel).
 * Older visits (no createdAt) take the latest story that doesn't belong to a newer visit.
 */
export function selectVisitSummary(
  s: { summaries: CaseSummary[]; visits?: Pick<Visit, 'id' | 'createdAt'>[] },
  v: Pick<Visit, 'id' | 'createdAt'>,
): CaseSummary | undefined {
  const visits = s.visits ?? [];
  for (let i = s.summaries.length - 1; i >= 0; i--) {
    if (isVisitStory(s.summaries[i], visits, v)) return s.summaries[i];
  }
  return undefined;
}

function isVisitStory(sum: CaseSummary, visits: Pick<Visit, 'id' | 'createdAt'>[], v: Pick<Visit, 'id' | 'createdAt'>): boolean {
  const owner = storyOwner(sum, visits);
  return owner === v.id || (!v.createdAt && owner === undefined);
}

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
  /** The visit this draft was typed for. Opening a different visit starts a fresh draft. */
  visitId?: string;
  update: (patch: Partial<StoryDraft>) => void;
  reset: () => void;
  /** Start (or keep) the draft for this visit. A draft from another visit is cleared. */
  startFor: (visitId: string) => void;
}

export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      draft: emptyDraft(),
      update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      reset: () => set({ draft: emptyDraft() }),
      startFor: (visitId) => set((s) => (s.visitId === visitId ? s : { draft: emptyDraft(), visitId })),
    }),
    { name: 'get-heard-draft', storage: createJSONStorage(() => sessionStorage) },
  ),
);
