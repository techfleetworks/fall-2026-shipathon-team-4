/**
 * Theo's server record (ADR-010), used only by the seed script (scripts/seed-theo.ts), never by the API.
 *
 * Built from content the team already has, unchanged:
 *  - Diana's demo data (src/data/demo.ts → buildDemoState), as-is
 *  - transcript.txt (src/data/sampleTranscript.ts): Theo's last visit gets the plain-language after-visit summary
 *    (ADR-011); its "what the doctor said" lines fill the Recap, and talking points that came up are marked covered
 *  - personas.json: Theo's last name
 * Labs and the clinical note are NOT included yet: waiting on the team's decision about their screens.
 * SYNTHETIC — illustrative only, not medical advice.
 */
import { buildDemoState } from '../../src/data/demo.js';
import { THEO_SAMPLE_TRANSCRIPT } from '../../src/data/sampleTranscript.js';
import { todayISO } from '../../src/lib/dates.js';
import { processTranscript } from '../../src/lib/transcript/intake.js';
import { summarizeVisit } from '../../src/lib/afterVisit/summary.js';

export const THEO_DEMO_EMAIL = 'theo.demo@example.com';

export function buildTheoRecord(): Record<string, unknown> {
  const demo = buildDemoState();
  const today = todayISO();

  const intake = processTranscript(THEO_SAMPLE_TRANSCRIPT, 'sample');
  if (intake.status !== 'accepted') throw new Error(`Theo's transcript did not pass intake: ${intake.status}`);
  // The last visit is the one already in the past (Dr. Lane, ~8 days ago in Diana's data).
  const visits = (demo.visits ?? []).map((v) => {
    if (v.date >= today) return v;
    const after = summarizeVisit(intake.payload, { patientName: 'Theo', talkingPoints: v.priorities });
    if (after.status !== 'ok') throw new Error(`Theo's after-visit summary failed: ${after.status}`);
    const s = after.summary;
    return {
      ...v,
      recap: { doctorSaid: s.doctorSaid, source: 'transcript' as const, updatedAt: new Date(`${v.date}T17:00:00Z`).toISOString() },
      covered: s.talkingPoints.filter((p) => p.raised).map((p) => p.text),
      afterVisit: s,
    };
  });

  return {
    ...demo,
    profile: { ...demo.profile, lastName: 'Marsh' },
    visits,
    demoMode: true,
  };
}
