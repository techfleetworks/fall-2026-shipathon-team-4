/**
 * The last safety net: if a reverse-pair wording edit ever slipped advice into the summary, the guardrails
 * block it instead of showing it. An unsafe phrase is planted here to prove the check runs.
 */
import { describe, expect, it, vi } from 'vitest';
import { THEO_SAMPLE_TRANSCRIPT } from '../../data/sampleTranscript';
import { BLOCKED_FALLBACK } from '../guardrails';
import { processTranscript } from '../transcript/intake';

vi.mock('./reversePairs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./reversePairs')>();
  return {
    ...actual,
    REVERSE_PAIRS: actual.REVERSE_PAIRS.map((p) => (p.id === 'sedation' ? { ...p, plain: 'why you should stop taking your medication' } : p)),
  };
});

const { summarizeVisit } = await import('./summary');

describe('summarizeVisit: unsafe wording is blocked at runtime', () => {
  it('shows the honest fallback instead of a summary that gives advice', () => {
    const t = processTranscript(THEO_SAMPLE_TRANSCRIPT, 'sample');
    if (t.status !== 'accepted') throw new Error(t.status);
    const out = summarizeVisit(t.payload, { patientName: 'Theo' });
    expect(out.status).toBe('blocked');
    if (out.status === 'blocked') {
      expect(out.message).toBe(BLOCKED_FALLBACK);
      expect(out.violations.map((v) => v.rule)).toContain('no-medical-advice');
    }
  });
});
