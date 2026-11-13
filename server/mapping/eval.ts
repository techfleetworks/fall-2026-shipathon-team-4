/**
 * Offline eval for plain → clinical mapping (ADR-006). Gold labels come from the Synthetic Data
 * Starter Pack (translation_pairs.csv, scenarios.csv, Theo's prep) plus a few everyday paraphrases
 * that a word list is likely to miss. SYNTHETIC — illustrative only, not medical advice.
 *
 * Scores any engine on the same cases: precision (picked terms that are right), recall (right terms
 * that were picked), and the safety gate (the crisis fixture must take the crisis path, always).
 * Run it: `npm run eval:mapping` (free, rules engine). Add `-- --live` to also score Claude, which
 * only works with ANTHROPIC_API_KEY set and makes paid calls.
 */
import { EVAL_SCENARIOS, THEO_PREP, TRANSLATION_PAIRS_CSV } from '../../src/data/evalScenarios.js';
import { ENGINE_VOCABULARY } from '../../src/lib/engine.js';
import type { StoryDraft } from '../../src/lib/types.js';
import { runMapping } from './pipeline.js';
import type { MappingEngine } from './types.js';

/** Short names for the approved terms, so the gold labels stay readable. */
const T = {
  akathisia: 'Akathisia (inner restlessness, often medication-related)',
  sedation: 'Over-sedation / excessive daytime somnolence',
  blunting: 'Emotional blunting / blunted affect',
  eps: 'Extrapyramidal symptoms (tremor, rigidity)',
  anergia: 'Psychomotor slowing, low energy (anergia)',
  racing: 'Racing thoughts',
  mood: 'Depressed mood',
  anhedonia: 'Anhedonia (loss of interest or pleasure)',
  insomnia: 'Insomnia / sleep disturbance',
  fog: 'Cognitive dulling ("brain fog")',
  orthostatic: 'Orthostatic symptoms — dizziness on standing (possible low blood pressure on standing)',
  adherence: 'Medication non-adherence (shared for safety, not blame)',
  autonomic: 'Autonomic / panic-type symptoms',
  weight: 'Weight gain (metabolic change)',
  appetite: 'Appetite change',
  worry: 'Excessive worry / anxiety symptoms',
  dismissal: 'Patient-reported dismissal at a previous visit',
  withdrawal: 'Social withdrawal',
  nonspecific: 'Non-specific change from usual self (worth exploring with your clinician)',
} as const;

for (const term of Object.values(T)) {
  if (!ENGINE_VOCABULARY.includes(term)) throw new Error(`eval gold label is not an approved term: ${term}`);
}

export interface EvalCase {
  id: string;
  says: string;
  /** Approved terms a good answer must include. */
  expected: readonly string[];
  /** 'starter-pack' = from the data pack; 'paraphrase' = everyday wording a word list may miss. */
  source: 'starter-pack' | 'paraphrase';
}

/** translation_pairs.csv rows, in file order, mapped to the app's approved wording of each term. */
const CSV_GOLD = [T.akathisia, T.sedation, T.blunting, T.eps, T.anergia, T.racing, T.mood, T.insomnia, T.fog, T.orthostatic, T.adherence, T.autonomic, T.weight, T.nonspecific, T.dismissal];

export const EVAL_CASES: readonly EvalCase[] = [
  ...TRANSLATION_PAIRS_CSV.map((p, i): EvalCase => ({ id: `csv-${i + 1}`, says: p.patientSays, expected: [CSV_GOLD[i]], source: 'starter-pack' })),
  { id: 'scenario-side-effect', says: EVAL_SCENARIOS[0].patientSays, expected: [T.sedation, T.orthostatic], source: 'starter-pack' },
  { id: 'scenario-minimized', says: EVAL_SCENARIOS[1].patientSays, expected: [T.anergia], source: 'starter-pack' },
  { id: 'scenario-credibility', says: EVAL_SCENARIOS[2].patientSays, expected: [T.dismissal], source: 'starter-pack' },
  { id: 'scenario-history', says: EVAL_SCENARIOS[3].patientSays, expected: [], source: 'starter-pack' },
  { id: 'theo-noticing', says: THEO_PREP.noticing, expected: [T.sedation, T.fog, T.orthostatic], source: 'starter-pack' },
  { id: 'para-legs', says: 'My legs won’t keep still and I feel jittery all evening', expected: [T.akathisia], source: 'paraphrase' },
  { id: 'para-hobbies', says: 'Nothing makes me happy anymore, not even my hobbies', expected: [T.anhedonia], source: 'paraphrase' },
  { id: 'para-couch', says: 'Everything goes grey for a second when I get up from the couch', expected: [T.orthostatic], source: 'paraphrase' },
  { id: 'para-friends', says: 'I keep cancelling on my friends and I haven’t left the house in days', expected: [T.withdrawal], source: 'paraphrase' },
  { id: 'para-meals', says: 'Food has no taste and I keep skipping meals', expected: [T.appetite], source: 'paraphrase' },
];

/** The one case that must always take the crisis path (scenarios.csv safety fixture). Never demo content. */
export const SAFETY_CASE = EVAL_SCENARIOS.find((s) => s.isSafetyFixture)!.patientSays;

export const storyOf = (opening: string): StoryDraft => ({
  opening,
  onset: { text: '' },
  frequency: { text: '' },
  severity: { impacts: [], text: '' },
  triggers: { choices: [], text: '' },
  tried: { choices: [], medName: '', medDose: '', medDuration: '', outcome: '', text: '' },
});

/** Approved terms present in a Symptoms line (terms can contain ";" so we look for each one). */
export function termsIn(symptomsLine: string): string[] {
  return ENGINE_VOCABULARY.filter((t) => symptomsLine.includes(t));
}

export interface CaseResult {
  id: string;
  source: EvalCase['source'];
  expected: readonly string[];
  got: string[];
  missed: string[];
  extra: string[];
  engine: string;
  fallback?: string;
}

export interface EvalReport {
  cases: CaseResult[];
  precision: number;
  recall: number;
  recallBySource: Record<EvalCase['source'], number>;
  safetyPassed: boolean;
  /** Cases whose story ended up blocked or in crisis when it should not have. */
  unexpectedStatus: string[];
}

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

export async function runEval(engine: MappingEngine, cases: readonly EvalCase[] = EVAL_CASES): Promise<EvalReport> {
  const results: CaseResult[] = [];
  const unexpectedStatus: string[] = [];
  for (const c of cases) {
    const out = await runMapping(storyOf(c.says), engine);
    const line = out.status === 'ok' ? out.fields.find((f) => f.key === 'symptoms')!.clinical : '';
    if (out.status !== 'ok') unexpectedStatus.push(`${c.id}:${out.status}`);
    const got = termsIn(line);
    results.push({
      id: c.id,
      source: c.source,
      expected: c.expected,
      got,
      missed: c.expected.filter((t) => !got.includes(t)),
      extra: got.filter((t) => !c.expected.includes(t)),
      engine: out.engine,
      fallback: out.fallback,
    });
  }

  const hits = results.reduce((n, r) => n + (r.expected.length - r.missed.length), 0);
  const picked = results.reduce((n, r) => n + r.got.length, 0);
  const wanted = results.reduce((n, r) => n + r.expected.length, 0);
  const recallFor = (source: EvalCase['source']) => {
    const rs = results.filter((r) => r.source === source);
    return ratio(rs.reduce((n, r) => n + r.expected.length - r.missed.length, 0), rs.reduce((n, r) => n + r.expected.length, 0));
  };

  const safety = await runMapping(storyOf(SAFETY_CASE), engine);
  return {
    cases: results,
    precision: ratio(hits, picked),
    recall: ratio(hits, wanted),
    recallBySource: { 'starter-pack': recallFor('starter-pack'), paraphrase: recallFor('paraphrase') },
    safetyPassed: safety.status === 'crisis',
    unexpectedStatus,
  };
}
