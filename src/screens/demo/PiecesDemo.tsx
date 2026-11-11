/**
 * Demo page for the backend's drop-in pieces: /demo/pieces (signed in; demo data recommended).
 * Not linked from the main navigation. It exists so the transcript flow and the disclaimers can be shown and
 * tested before the design decides where they live. When the design places them, each piece moves there with
 * one line, and this page can be deleted.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { DisclaimerCard, DisclaimerNote } from '../../components/guardrails/Disclaimers';
import { TranscriptImport } from '../../components/transcript/TranscriptImport';
import { formatShort, todayISO } from '../../lib/dates';
import { AI_IN_USE, type DisclaimerKey } from '../../lib/guardrails/copy';
import { useApp } from '../../lib/store';

const DISCLAIMER_KINDS: DisclaimerKey[] = ['notMedicalAdvice', 'short', 'notForEmergencies', 'onboarding', 'aiCanBeWrong'];

export function PiecesDemo() {
  const demo = useApp((s) => s.demoMode);
  const name = useApp((s) => s.profile?.name);
  const visits = useApp((s) => s.visits);
  const updateVisit = useApp((s) => s.updateVisit);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  // The most recent visit that has already happened: where a transcript's recap belongs.
  const lastVisit = [...visits].filter((v) => v.date <= todayISO()).sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <Shell header={{ kind: 'sub', title: 'Demo · drop-in pieces', back: '/home', backLabel: 'Home' }} wide>
      <h1>Drop-in pieces</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Backend features ready for the design to place. Each one is a single component.
      </p>

      <h2 className="eyebrow-soft">1 · In the room: transcript → recap</h2>
      {savedTo ? (
        <section className="panel">
          <p style={{ margin: 0 }}>Added to the recap for your visit on {formatShort(savedTo)}.</p>
          <div className="btn-row">
            {lastVisit && <Link to={`/visits/${lastVisit.id}/after`} className="btn btn--primary">Open the recap</Link>}
            <button className="btn btn--outline" onClick={() => setSavedTo(null)}>Try another transcript</button>
          </div>
        </section>
      ) : (
        <TranscriptImport
          patientName={name}
          demo={demo}
          onUse={(doctorSaid) => {
            if (!lastVisit) return;
            // Only the reviewed lines are kept (an approved, structured record); the transcript itself is not.
            updateVisit(lastVisit.id, { recap: { doctorSaid, source: 'transcript', updatedAt: new Date().toISOString() } });
            setSavedTo(lastVisit.date);
          }}
        />
      )}
      {!lastVisit && <p className="note">Add a past visit first, so the recap has somewhere to go.</p>}
      <p className="note"><code>{'<TranscriptImport patientName={…} demo={…} onUse={(lines) => …} />'}</code></p>

      <h2 className="eyebrow-soft">2 · Disclaimers</h2>
      {DISCLAIMER_KINDS.map((kind) => (
        <section key={kind} className="panel panel--muted">
          <span className="eyebrow-soft">{kind}</span>
          {kind === 'aiCanBeWrong' && !AI_IN_USE ? (
            <p className="note">Hidden on purpose until AI is in use (AI_IN_USE = false).</p>
          ) : kind === 'notForEmergencies' ? (
            <DisclaimerCard kind={kind} />
          ) : (
            <DisclaimerNote kind={kind} />
          )}
          <p className="note"><code>{kind === 'notForEmergencies' ? `<DisclaimerCard kind="${kind}" />` : `<DisclaimerNote kind="${kind}" />`}</code></p>
        </section>
      ))}
    </Shell>
  );
}
