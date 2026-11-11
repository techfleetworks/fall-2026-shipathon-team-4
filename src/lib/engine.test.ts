import { describe, expect, it, vi } from 'vitest';
import { EVAL_SCENARIOS, THEO_PREP, TRANSLATION_PAIRS_CSV } from '../data/evalScenarios';
import { BLOCKED_FALLBACK, CRISIS_SENTINEL } from './guardrails';
import { translateStoryGuarded } from './engine';
import { translateStory } from './translate';
import type { StoryDraft, SummaryField } from './types';

const draft = (opening: string, patch: Partial<StoryDraft> = {}): StoryDraft => ({
  opening,
  onset: { text: '' },
  frequency: { text: '' },
  severity: { impacts: [], text: '' },
  triggers: { choices: [], text: '' },
  tried: { choices: [], medName: '', medDose: '', medDuration: '', outcome: '', text: '' },
  ...patch,
});

/** A pretend engine that returns one Symptoms line, to simulate a misbehaving engine (e.g. a future AI). */
const engineSaying = (symptoms: string) => (d: StoryDraft): SummaryField[] =>
  translateStory(d).map((f) => (f.key === 'symptoms' ? { ...f, clinical: symptoms } : f));

describe('translateStoryGuarded: the live engine path', () => {
  it('shows Theo’s summary (all rules pass)', () => {
    const out = translateStoryGuarded(draft(`${THEO_PREP.goal} ${THEO_PREP.noticing}`));
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.fields.find((f) => f.key === 'symptoms')!.clinical).toContain('Over-sedation');
  });

  it.each([...EVAL_SCENARIOS.filter((s) => !s.isSafetyFixture).map((s) => s.patientSays), ...TRANSLATION_PAIRS_CSV.map((p) => p.patientSays)])(
    'passes the Starter Pack input %j',
    (says) => {
      expect(translateStoryGuarded(draft(says)).status).toBe('ok');
    },
  );

  it('echoes the patient’s own medication and dose without being blocked', () => {
    const d = draft('The meds make me a zombie', {
      tried: { choices: ['Medication'], medName: 'Ziprasidone', medDose: '40 mg', medDuration: '5 weeks', outcome: 'drowsy', text: '' },
    });
    const out = translateStoryGuarded(d);
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.fields.find((f) => f.key === 'tried')!.clinical).toContain('Ziprasidone 40 mg');
  });

  it('goes to the crisis path without running the engine when the story has crisis language', () => {
    const engine = vi.fn(translateStory);
    expect(translateStoryGuarded(draft("I don't see the point anymore"), engine)).toEqual({ status: 'crisis' });
    expect(engine).not.toHaveBeenCalled();
  });

  it.each([
    ['a diagnosis', 'Bipolar disorder', 'no-diagnosis'],
    ['advice', 'You should stop taking your medication', 'no-medical-advice'],
    ['a dose', 'Over-sedation / excessive daytime somnolence; take 20 mg at night', 'no-dosing'],
    ['an unreported drug', 'Racing thoughts; consider sertraline', 'no-dosing'],
    ['an invented term', 'Racing thoughts; Hyperkinetic dysphoria', 'honest-uncertainty'],
  ])('blocks an engine that outputs %s and shows the honest fallback', (_name, symptoms, rule) => {
    const out = translateStoryGuarded(draft('My mind won’t stop, thoughts racing'), engineSaying(symptoms));
    expect(out.status).toBe('blocked');
    if (out.status === 'blocked') {
      expect(out.message).toBe(BLOCKED_FALLBACK);
      expect(out.violations.map((v) => v.rule)).toContain(rule);
    }
  });

  it('routes the engine’s own crisis signal to the crisis path', () => {
    expect(translateStoryGuarded(draft('I feel off'), engineSaying(CRISIS_SENTINEL))).toEqual({ status: 'crisis' });
  });
});

describe('live preview helpers (useServerSummary.ts)', async () => {
  const { applyOverrides, isEmptyStory, PLACEHOLDER_FIELDS } = await import('./useServerSummary');
  it('puts the patient’s own rewrites on top of the server’s lines', () => {
    const out = applyOverrides(PLACEHOLDER_FIELDS, { onset: 'About 5 weeks ago', tried: '' });
    expect(out.find((f) => f.key === 'onset')).toMatchObject({ clinical: 'About 5 weeks ago', editedByPatient: true });
    expect(out.find((f) => f.key === 'tried')).toMatchObject({ clinical: 'Not discussed', editedByPatient: true });
    expect(out.find((f) => f.key === 'symptoms')!.editedByPatient).toBeUndefined();
  });
  it('treats an untouched story as empty (no server call), and any answer as not empty', () => {
    expect(isEmptyStory(draft(''))).toBe(true);
    expect(isEmptyStory(draft('', { frequency: { choice: 'Weekly', text: '' } }))).toBe(false);
    expect(isEmptyStory(draft('tired'))).toBe(false);
  });
});
