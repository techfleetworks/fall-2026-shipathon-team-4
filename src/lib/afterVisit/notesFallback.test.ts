import { describe, expect, it } from 'vitest';
import { summarizeVisitNotes } from './notesSummary.js';
import { resolveNotesSummary } from './useAfterVisitSummary.js';
import type { NotesSummaryOutcome } from '../api.js';

const NOTES = 'Dr said it might be orthostatic hypotension\nfollow up in 4 weeks';
const unauthorized: NotesSummaryOutcome = { status: 'rejected', error: { code: 'UNAUTHORIZED', message: 'Your sign-in has expired. Please log in again.' } };
const offline: NotesSummaryOutcome = { status: 'unavailable', message: 'We couldn’t reach the server…' };

describe('after-visit summary from quick notes: works without the server', () => {
  it('not signed in (401): the summary is made on this device, the same as the server would', () => {
    const out = resolveNotesSummary(unauthorized, NOTES, ['Dizzy when I stand up']);
    expect(out.status).toBe('ok');
    expect(out).toEqual(summarizeVisitNotes(NOTES, { talkingPoints: ['Dizzy when I stand up'] }));
    expect(out.status === 'ok' && out.summary.plan).toEqual(['Check again in 4 weeks.']);
  });

  it('offline: the summary is made on this device', () => {
    expect(resolveNotesSummary(offline, NOTES, []).status).toBe('ok');
  });

  it('the server answer is used when there is one', () => {
    const server: NotesSummaryOutcome = { status: 'ok', summary: { from: 'server' } as never };
    expect(resolveNotesSummary(server, NOTES, [])).toBe(server);
  });

  it('other server refusals are kept (e.g. notes too long), nothing made on the device', () => {
    const tooLong: NotesSummaryOutcome = { status: 'rejected', error: { code: 'TEXT_TOO_LONG', message: 'too long' } };
    expect(resolveNotesSummary(tooLong, NOTES, [])).toBe(tooLong);
  });

  it('crisis words in the notes → crisis on the device path too (nothing built)', () => {
    expect(resolveNotesSummary(unauthorized, 'follow up in 2 weeks. I want to hurt myself', [])).toEqual({ status: 'crisis' });
  });

  it('notes that read like a conversation are summarized as a transcript on the device too', () => {
    // The same conversation the server route's test uses (server/notesSummary.test.ts).
    const spoken = 'Me: I get dizzy when I stand up.\nDr. Kim: Hello there.\nMe: It started after the dose change.\nDr. Kim: Let us run a blood test today. We will follow up in two weeks.';
    const out = resolveNotesSummary(offline, spoken, []);
    expect(out.status === 'ok' && out.summary.source).toBe('transcript');
  });

  it('only the first 3 talking points are used, like the server', () => {
    const out = resolveNotesSummary(offline, NOTES, ['a', 'b', 'c', 'd']);
    expect(out.status === 'ok' && out.summary.talkingPoints.map((t) => t.text)).toEqual(['a', 'b', 'c']);
  });
});
