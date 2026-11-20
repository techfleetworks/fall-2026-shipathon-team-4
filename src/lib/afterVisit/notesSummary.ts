/**
 * The after-visit summary from a visit's quick notes (ADR-014): ONE function used by both the server
 * (POST /api/notes-summary) and the device (fallback when the server can't be reached or says "log in", ADR-024).
 * Notes that read like a conversation ("Dr. Lane: …") are summarized as a transcript; anything else as notes.
 * Crisis language → crisis (nothing built). Free, rule-based; stores nothing.
 */
import { processTranscript } from '../transcript/intake.js';
import { summarizeNotes, summarizeVisit, type AfterVisitResult } from './summary.js';

export function summarizeVisitNotes(notes: string, { talkingPoints = [] }: { talkingPoints?: readonly string[] } = {}): AfterVisitResult {
  const asTranscript = processTranscript(notes, 'paste');
  if (asTranscript.status === 'crisis') return { status: 'crisis' };
  return asTranscript.status === 'accepted'
    ? summarizeVisit(asTranscript.payload, { talkingPoints })
    : summarizeNotes(notes, { talkingPoints });
}
