/**
 * Theo's server record (ADR-010), used only by the seed script (scripts/seed-theo.ts), never by the API.
 *
 * Built from content the team already has, unchanged:
 *  - Diana's demo data (src/data/demo.ts → buildDemoState), as-is
 *  - transcript.txt (src/data/sampleTranscript.ts): Dr. Lane's lines become the Recap of Theo's last visit
 *  - personas.json: Theo's last name
 * Labs and the clinical note are NOT included yet: waiting on the team's decision about their screens.
 * SYNTHETIC — illustrative only, not medical advice.
 */
import { buildDemoState } from '../../src/data/demo.js';
import { THEO_SAMPLE_TRANSCRIPT } from '../../src/data/sampleTranscript.js';
import { todayISO } from '../../src/lib/dates.js';
import { processTranscript } from '../../src/lib/transcript/intake.js';
import { doctorSaidFrom } from '../../src/lib/transcript/recap.js';

export const THEO_DEMO_EMAIL = 'theo.demo@example.com';

export function buildTheoRecord(): Record<string, unknown> {
  const demo = buildDemoState();
  const today = todayISO();

  const intake = processTranscript(THEO_SAMPLE_TRANSCRIPT, 'sample');
  if (intake.status !== 'accepted') throw new Error(`Theo's transcript did not pass intake: ${intake.status}`);
  const doctorSaid = doctorSaidFrom(intake.payload, 'Theo');

  // The last visit is the one already in the past (Dr. Lane, ~8 days ago in Diana's data).
  const visits = (demo.visits ?? []).map((v) =>
    v.date < today ? { ...v, recap: { doctorSaid, source: 'transcript' as const, updatedAt: new Date(`${v.date}T17:00:00Z`).toISOString() } } : v,
  );

  return {
    ...demo,
    profile: { ...demo.profile, lastName: 'Marsh' },
    visits,
    demoMode: true,
  };
}
