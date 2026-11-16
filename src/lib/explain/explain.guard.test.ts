/**
 * The runtime safety net: if a glossary edit ever slipped through review with unsafe wording, the
 * explainer blocks it instead of showing it. A bad entry is planted here to prove the check runs.
 */
import { describe, expect, it, vi } from 'vitest';
import { BLOCKED_FALLBACK } from '../guardrails';

vi.mock('./glossary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./glossary')>();
  return {
    ...actual,
    GLOSSARY: [
      { id: 'bad', term: 'Somnolence', kind: 'term', match: /\bsomnolence\b/i, plain: 'You have a sleep disorder; you should stop taking your medication.' },
      ...actual.GLOSSARY,
    ],
  };
});

const { explainClinical } = await import('./explain');

describe('explainClinical: unsafe glossary wording is blocked at runtime', () => {
  it('shows the honest fallback instead of the unsafe explanation', () => {
    const out = explainClinical('daytime somnolence');
    expect(out.status).toBe('blocked');
    if (out.status === 'blocked') {
      expect(out.message).toBe(BLOCKED_FALLBACK);
      expect(out.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['no-diagnosis', 'no-medical-advice']));
    }
  });
});
