/**
 * "Patterns across visits" panel for My history (board card "Clinically-legible case view", ADR-017).
 * Runs the case-view engine on this device, from the record already here (nothing is sent anywhere).
 * Uses Diana's existing panel / list classes only. All wording here is a first draft for Diana and Product to edit.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildCaseView, MIN_ENTRIES } from '../lib/caseView/caseView';
import { formatShort, todayISO } from '../lib/dates';
import { useApp } from '../lib/store';

export function CasePatterns() {
  const medications = useApp((s) => s.medications);
  const evidence = useApp((s) => s.evidence);
  const visits = useApp((s) => s.visits);
  const followUps = useApp((s) => s.followUps);
  const result = useMemo(() => buildCaseView({ medications, evidence, visits, followUps }, todayISO()), [medications, evidence, visits, followUps]);

  return (
    <section className="panel" aria-labelledby="cp" style={{ marginTop: 24 }}>
      <span id="cp" className="eyebrow-soft">Patterns across visits</span>
      {result.status === 'crisis' ? (
        <p style={{ margin: 0 }}>
          We paused patterns because something in your history sounds hard. <Link to="/help-now">Support is here</Link> whenever you need it.
        </p>
      ) : !result.view.enough ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Nothing to compare yet. Patterns show up once your history has at least {MIN_ENTRIES} dated entries, like when a medicine
            changed and when a symptom started. {result.view.entries === 0 ? 'You have none yet.' : `You have ${result.view.entries} so far.`}
          </p>
          <Link to="/case/add" className="link-btn no-print" style={{ alignSelf: 'flex-start' }}>+ Add a date</Link>
        </>
      ) : (
        <>
          {result.view.patterns.length === 0 && result.view.openQuestions.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>No patterns yet. As you add visits and dates, anything that repeats will show here.</p>
          )}
          {result.view.patterns.length > 0 && (
            <ul className="found" aria-label="Patterns">
              {result.view.patterns.map((p) => <li key={p.id}><span>{p.text}</span></li>)}
            </ul>
          )}
          {result.view.openQuestions.length > 0 && (
            <>
              <strong>Still open</strong>
              <ul className="found" aria-label="Still open">
                {result.view.openQuestions.map((q) => (
                  <li key={q.id}><span>{q.text} <span className="small muted">{q.why}</span></span></li>
                ))}
              </ul>
            </>
          )}
          {result.view.highlights.length > 0 && (
            <>
              <strong>Key dates</strong>
              <ul className="found" aria-label="Key dates">
                {result.view.highlights.map((h) => <li key={`${h.ref.kind}-${h.ref.id}`}><span><strong>[{formatShort(h.date)}]</strong> {h.text}</span></li>)}
              </ul>
            </>
          )}
          {result.view.patterns.length > 0 && <p className="small muted" style={{ margin: 0 }}>{result.view.note}</p>}
        </>
      )}
    </section>
  );
}
