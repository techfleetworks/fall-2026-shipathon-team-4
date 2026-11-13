/**
 * The last safety net: if an AI answer passes the contract but the final text still breaks a
 * guardrail rule, the patient gets the rules answer instead. A valid answer rarely trips this, so the
 * guardrail check is forced to block only the AI-built summary here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEO_PREP } from '../../src/data/evalScenarios.js';
import { storyOf } from './eval.js';
import { runMapping } from './pipeline.js';
import { standInEngine } from './standIn.js';

vi.mock('../../src/lib/engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/engine.js')>();
  return {
    ...actual,
    // Blocks only when called with a custom engine (the AI-built summary); the rules call is untouched.
    translateStoryGuarded: (...args: Parameters<typeof actual.translateStoryGuarded>) =>
      args[1]
        ? { status: 'blocked', message: 'blocked', violations: [{ rule: 'no-diagnosis', reason: 'forced in test', excerpt: '' }] }
        : actual.translateStoryGuarded(...args),
  };
});

afterEach(() => vi.restoreAllMocks());

describe('runMapping: guardrail fallback', () => {
  it('shows the rules answer when the AI-built summary breaks a guardrail rule', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ai = standInEngine(() => ({
      crisis_language: false,
      symptoms: [{ term: 'Cognitive dulling ("brain fog")', patient_quote: 'foggy' }],
    }));
    const out = await runMapping(storyOf(THEO_PREP.noticing), ai);
    expect(out).toMatchObject({ status: 'ok', engine: 'rules', fallback: 'guardrail' });
    expect(warn.mock.calls.flat().join(' ')).toContain('guardrail (no-diagnosis)');
  });
});
