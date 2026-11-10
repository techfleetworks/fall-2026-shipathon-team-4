import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { IconTrash } from '../components/Icons';
import { formatDate, todayISO, uid } from '../lib/dates';
import { selectUpcomingVisit, useApp, useVisitTranscripts } from '../lib/store';

export function Visits() {
  const state = useApp();
  const navigate = useNavigate();
  const upcoming = selectUpcomingVisit(state);
  const transcripts = useVisitTranscripts((s) => s.byVisit);
  const past = state.visits.filter((v) => v !== upcoming).sort((a, b) => b.date.localeCompare(a.date));
  const [date, setDate] = useState(upcoming?.date ?? '');
  const [clinician, setClinician] = useState(upcoming?.clinician ?? '');
  const [pastDate, setPastDate] = useState('');

  const logPast = () => {
    const id = uid();
    useApp.setState((s) => ({ visits: [...s.visits, { id, date: pastDate, priorities: [], askingFor: [] }] }));
    navigate(`/visits/${id}/check-in`);
  };

  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <h1>Visits</h1>

      <section className="card">
        <h3>Next visit</h3>
        <div className="field">
          <label htmlFor="nv">Date</label>
          <input id="nv" type="date" className="input" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl">Clinician <span className="muted">(optional)</span></label>
          <input id="cl" className="input" value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="e.g. Dr. Lane" />
        </div>
        <div className="row row--wrap">
          <button className="btn btn--primary btn--sm" disabled={!date} onClick={() => state.setNextVisit(date, clinician.trim() || undefined)}>
            {upcoming ? 'Update' : 'Save'}
          </button>
          {upcoming && <Link to="/brief" className="btn btn--sm">Open brief</Link>}
          {upcoming && <Link to="/today" className="btn btn--sm">Morning-of prep</Link>}
          {upcoming && upcoming.date <= todayISO() && <Link to={`/visits/${upcoming.id}/check-in`} className="btn btn--sm">Post-visit check-in</Link>}
          {upcoming && upcoming.date <= todayISO() && <Link to={`/visits/${upcoming.id}/transcript`} className="btn btn--sm">What was said</Link>}
        </div>
      </section>

      <h2 className="section-label">Past visits</h2>
      {past.length === 0 && <p className="small muted">None yet.</p>}
      {past.map((v) => (
        <div key={v.id} className="card card--soft">
          <div className="row row--between">
            <span className="card__title">{formatDate(v.date)}{v.clinician ? ` · ${v.clinician}` : ''}</span>
            <button className="icon-btn" aria-label={`Delete visit on ${formatDate(v.date)}`} onClick={() => confirm('Delete this visit for good?') && state.deleteVisit(v.id)}>
              <IconTrash width={16} height={16} />
            </button>
          </div>
          {v.checkIn ? (
            <span>Felt heard {v.checkIn.feltHeard}/5 · {v.checkIn.nextSteps.join(', ')}</span>
          ) : (
            <Link to={`/visits/${v.id}/check-in`} className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>Add check-in</Link>
          )}
          {v.date <= todayISO() && (
            <Link to={`/visits/${v.id}/transcript`} className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>
              {transcripts[v.id] ? `What was said · ${transcripts[v.id]!.stats.dialogueTurns} lines` : 'Add what was said in the room'}
            </Link>
          )}
        </div>
      ))}

      <section className="card card--muted">
        <h3>Log a visit that already happened</h3>
        <div className="row">
          <label htmlFor="pd" className="sr-only">Visit date</label>
          <input id="pd" type="date" className="input" max={todayISO()} value={pastDate} onChange={(e) => setPastDate(e.target.value)} />
          <button className="btn btn--sm" disabled={!pastDate} onClick={logPast}>Check in</button>
        </div>
      </section>
    </Shell>
  );
}
