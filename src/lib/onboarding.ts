/**
 * Onboarding progress, kept on this device so "Save and finish later" resumes
 * where the person left off. Cleared when onboarding finishes.
 * Holds no story text: the quick-try entry is saved to the case itself (O5).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ConsentPrefs, ForWhom } from './types';

export interface OnboardingDraft {
  step: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  /** Salted hash from sign-up (never the password). */
  passwordHash?: { salt: string; hash: string };
  /** Confirmed 18+ and in the US (required). */
  ageConfirmed: boolean;
  forWhom?: ForWhom;
  reasons: string[];
  brushedOff?: 'Yes' | 'Not sure' | 'No';
  consent: ConsentPrefs;
  /** Number of notes imported in O4. */
  imported: number;
  /** What was added in step 3 (history entry ids), for the "Added to your history" review. */
  importedItems: ImportedItem[];
  /** Step 3 shows the "Added to your history" review instead of the import choices. */
  importReview: boolean;
  /** True once the O5 quick-try entry was saved. */
  quickSaved: boolean;
  visitDate: string;
  /** HH:MM, optional. */
  visitTime?: string;
  clinician: string;
  clinicianEmail?: string;
  affiliation?: string;
  specialty?: string;
  /** What the person typed when "Other" is the type of doctor. */
  otherSpecialty?: string;
  reason?: string;
}

export interface ImportedItem {
  /** The history (evidence) entry this became. */
  id: string;
  kind: 'note' | 'image' | 'pdf';
  /** What the person sees: the start of the note, or the file name. */
  label: string;
}

// Optional keys are listed explicitly so reset() clears them (zustand merges state).
const initial = (): OnboardingDraft => ({
  step: 1,
  email: undefined,
  firstName: undefined,
  lastName: undefined,
  passwordHash: undefined,
  ageConfirmed: false,
  forWhom: undefined,
  brushedOff: undefined,
  specialty: undefined,
  visitTime: undefined,
  clinicianEmail: undefined,
  affiliation: undefined,
  otherSpecialty: undefined,
  reason: undefined,
  reasons: [],
  // Only "Save my story" starts on (needed to use the app). The optional ones are the person's own choice.
  consent: { saveStory: true, makeSummaries: false, anonymousRatings: false },
  imported: 0,
  importedItems: [],
  importReview: false,
  quickSaved: false,
  visitDate: '',
  clinician: '',
});

interface State extends OnboardingDraft {
  set: (patch: Partial<OnboardingDraft>) => void;
  reset: () => void;
}

export const useOnboarding = create<State>()(
  persist(
    (set) => ({
      ...initial(),
      set: (patch) => set(patch),
      reset: () => set(initial()),
    }),
    {
      name: 'appointment-ready-onboarding',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // v1: "Who is this for?" removed — shift saved progress back one step.
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<OnboardingDraft>;
        if (version < 1 && typeof st.step === 'number') st.step = Math.max(1, st.step - 1);
        return st as State;
      },
    },
  ),
);
