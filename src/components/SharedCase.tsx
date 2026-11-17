/**
 * The shareable record on the doctor's view (ADR-020): the case in doctor terms, as frozen when the patient made the link.
 * Shown under the one-page brief only when the patient included "Case history". Uses Diana's room__card / room__label
 * classes. Headings are a first draft for Diana and Dominic.
 */
import { formatDate } from '../lib/dates';
import type { CaseSnapshot } from '../lib/types';

function Lines({ label, lines }: { label: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <section className="room__card">
      <span className="room__label">{label}</span>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </section>
  );
}

export function SharedCase({ data }: { data: CaseSnapshot }) {
  return (
    // breakBefore: printed, the case history starts on page 2 (the brief stays one page). No effect on screen.
    <section aria-labelledby="case-h" className="stack-sm" style={{ marginTop: 24, breakBefore: 'page' }}>
      <h2 id="case-h" className="room__who" style={{ fontSize: '1.25rem' }}>Case history</h2>
      <p className="small muted" style={{ margin: 0 }}>Patient-reported, from their dated record in the app. Patterns show timing, not cause.</p>
      <div className="room__grid room__grid--one">
        <div className="room__side">
          <Lines label="Presenting symptoms" lines={data.presenting} />
          <Lines label="Course" lines={data.course} />
          <Lines label="Medications" lines={data.medications} />
          <Lines label="Patterns across visits" lines={data.patterns} />
          <Lines label="Still open" lines={data.openItems} />
          {data.keyDates.length > 0 && (
            <section className="room__card">
              <span className="room__label">Key dates</span>
              {data.keyDates.map((k, i) => <p key={i}><strong>{formatDate(k.date)}:</strong> {k.text}</p>)}
            </section>
          )}
          {data.visits.length > 0 && (
            <section className="room__card">
              <span className="room__label">Past visits</span>
              {data.visits.map((v, i) => (
                <p key={i}>
                  <strong>{formatDate(v.date)}</strong>
                  {v.clinician ? ` · ${v.clinician}` : ''}
                  {v.feltHeard ? ` · patient-rated felt heard ${v.feltHeard}/5` : ''}
                </p>
              ))}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
