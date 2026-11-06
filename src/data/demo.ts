/**
 * Seeded demo: Theo Marsh, from the Synthetic Data Starter Pack (personas.json,
 * transcript.txt, clinical_note.txt). SYNTHETIC — illustrative only, not medical advice.
 * Dates are relative to today so the demo always looks current.
 */
import { addDays, todayISO, uid } from '../lib/dates';
import type { AppData } from '../lib/store';

export function buildDemoState(): Partial<AppData> {
  const today = todayISO();
  const doseChange = addDays(today, -35); // "started 5 weeks ago"
  const onset = addDays(today, -33);
  const lastVisit = addDays(today, -8);
  const nextVisit = addDays(today, 20);
  const lastVisitId = uid();

  return {
    demoMode: true,
    profile: {
      name: 'Theo',
      age: 30,
      forWhom: 'myself',
      reasons: ['Low mood'],
      consentAccepted: true,
      onboarded: true,
    },
    medications: [{ id: uid(), name: 'Ziprasidone', dose: 'dose increased', started: doseChange, note: 'dose increase' }],
    summaries: [
      {
        id: uid(),
        createdAt: new Date(addDays(today, -2)).toISOString(),
        opening:
          'The meds make me a zombie. I’m drowsy and foggy all day, worse after each dose, and I get dizzy and lightheaded when I stand up.',
        fields: [
          {
            key: 'symptoms',
            label: 'Symptoms',
            clinical:
              'Over-sedation / excessive daytime somnolence; Orthostatic symptoms — dizziness on standing (possible low blood pressure on standing); Cognitive dulling ("brain fog")',
            quote: 'The meds make me a zombie… dizzy and lightheaded when I stand up.',
          },
          { key: 'onset', label: 'Onset', clinical: '5 weeks, began after a medication change', quote: 'It started with the dose change, not before.' },
          { key: 'frequency', label: 'Frequency', clinical: 'Daily (7 days / week)', quote: 'Every day' },
          {
            key: 'severity',
            label: 'Severity',
            clinical: '7/10, affects daily function (work or school)',
            quote: 'I’m falling asleep at my desk.',
          },
          { key: 'triggers', label: 'Triggers', clinical: 'Worse with: after a dose, standing up' },
          { key: 'tried', label: 'Tried', clinical: 'Ziprasidone, dose increased 5 weeks ago — told body will adjust' },
        ],
      },
    ],
    evidence: [
      { id: uid(), date: doseChange, type: 'medication', title: 'Medication', detail: 'Ziprasidone dose increased' },
      { id: uid(), date: onset, type: 'symptom', title: 'Symptom', detail: 'Daytime sleepiness and dizziness on standing began' },
      {
        id: uid(),
        date: lastVisit,
        type: 'visit',
        title: 'Visit',
        detail: 'Felt heard 2/5 · attributed to depression · standing blood pressure not rechecked · review in 4 weeks',
      },
      { id: uid(), date: addDays(today, -2), type: 'symptom', title: 'Story saved', detail: 'Over-sedation; orthostatic symptoms; brain fog' },
    ],
    visits: [
      {
        id: lastVisitId,
        date: lastVisit,
        clinician: 'Dr. Lane',
        priorities: ['Daytime sleepiness since the dose change'],
        askingFor: [],
        checkIn: { feltHeard: 2, nextSteps: ['Follow-up visit'], dueDate: nextVisit, scriptHelped: 'A little' },
      },
      {
        id: uid(),
        date: nextVisit,
        clinician: 'Dr. Lane',
        priorities: [
          'Daytime sleepiness since the dose increase — falling asleep at work',
          'Dizzy and lightheaded when standing up',
          'What are the options: lower the dose, switch, or change timing?',
        ],
        askingFor: ['Medication review', 'Standing blood pressure check'],
      },
    ],
    followUps: [{ id: uid(), visitId: lastVisitId, step: 'Follow-up visit', dueDate: nextVisit }],
    savedScripts: ['dismiss-depression', 'side-effect-timing'],
    sharedTips: [],
  };
}
