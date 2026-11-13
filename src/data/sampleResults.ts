/**
 * Theo's labs and clinical note from the Synthetic Data Starter Pack (labs.csv, clinical_note.txt), verbatim.
 * SYNTHETIC — illustrative only, not medical advice. All people and clinics are fictional.
 *
 * labs.csv's plain_meaning column is left out on purpose: the explainer writes its own neutral lines
 * (ADR-008), and never passes through interpretation text from a file.
 */
import type { LabRow } from '../lib/labs/labs';

export const THEO_LABS_CSV = `test,value,typical_range,plain_meaning
Blood pressure (sitting -> standing),118/76 -> 98/64 mmHg,small drop,A notable drop on standing can explain the lightheadedness
Fasting glucose,104 mg/dL,70-99,Slightly above range — worth monitoring on this medication
Total cholesterol,214 mg/dL,< 200,Mildly elevated
Weight change,+11 lb in 5 weeks,—,Rapid gain since starting ziprasidone
Prolactin,18 ng/mL,4-15,Mildly elevated; can be medication-related`;

export const THEO_LABS: readonly LabRow[] = [
  { test: 'Blood pressure (sitting -> standing)', value: '118/76 -> 98/64 mmHg', typicalRange: 'small drop' },
  { test: 'Fasting glucose', value: '104 mg/dL', typicalRange: '70-99' },
  { test: 'Total cholesterol', value: '214 mg/dL', typicalRange: '< 200' },
  { test: 'Weight change', value: '+11 lb in 5 weeks', typicalRange: '—' },
  { test: 'Prolactin', value: '18 ng/mL', typicalRange: '4-15' },
];

export const THEO_CLINICAL_NOTE =
  '30 y/o male, h/o mood disorder, on ziprasidone 5/52. Reports daytime somnolence and light-headedness, query medication side effect vs. depressive anergia; ?orthostatic hypotension, postural BP not repeated today. Advised to continue current dose, RV in 4/52. Metabolic parameters trending up; consider monitoring.';
