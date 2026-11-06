import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { IconDown, IconGrip, IconTrash, IconUp } from '../components/Icons';
import { ChipMulti, Disclaimer, useToast } from '../components/ui';
import { formatDate, todayISO } from '../lib/dates';
import { hasCrisisLanguage } from '../lib/safety';
import { caseAsText, shareText } from '../lib/share';
import { selectLatestSummary, selectUpcomingVisit, useApp } from '../lib/store';
import type { Visit } from '../lib/types';

const ASKING = ['Medication review', 'Referral', 'Test or lab work', 'Standing blood pressure check', 'Follow-up plan', 'Second opinion'];
const MAX_PRIORITIES = 3;

export function Brief() {
  const state = useApp();
  const latest = selectLatestSummary(state);
  const visit = selectUpcomingVisit(state);
  const [toast, showToast] = useToast();

  if (!visit) return <NoVisit />;

  const ready = !!latest && visit.priorities.length > 0 && visit.askingFor.length > 0;
  const update = (patch: Partial<Visit>) => state.updateVisit(visit.id, patch);

  return (
    <Shell header={{ kind: 'sub', back: '/home' }}>
      <h1>Your one - page brief</h1>
      <span className={`badge${ready ? '' : ' badge--muted'}`}>{ready ? 'Ready for your visit' : 'In progress'}</span>
      <p className="lead">
        {formatDate(visit.date)}{visit.clinician ? ` · ${visit.clinician}` : ''}. 30 minutes go fast. Lead with what matters most.
      </p>

      <Priorities visit={visit} update={update} suggestions={suggestionsFrom(latest?.fields.find((f) => f.key === 'symptoms')?.clinical)} />

      <section className="card card--soft">
        <span className="card__label">History in brief</span>
        {latest ? (
          <ul className="list">
            {latest.fields.filter((f) => f.key !== 'symptoms' && f.clinical !== 'Not discussed').map((f) => (
              <li key={f.key}><strong>{f.label}:</strong> {f.clinical}</li>
            ))}
            {state.medications.map((m) => (
              <li key={m.id}><strong>Medication:</strong> {m.name}{m.dose ? `, ${m.dose}` : ''} since {formatDate(m.started)}</li>
            ))}
          </ul>
        ) : (
          <>
            <p className="muted">Tell your story first and this fills in for you.</p>
            <Link to="/story" className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>Tell my story</Link>
          </>
        )}
      </section>

      <section className="card card--soft">
        <span className="card__label">What I’m asking for</span>
        <ChipMulti
          label="What I'm asking for"
          options={[...new Set([...ASKING, ...visit.askingFor])]}
          value={visit.askingFor}
          onChange={(askingFor) => update({ askingFor })}
        />
      </section>

      <Disclaimer />

      <Link to="/brief/doctor" className="btn btn--primary btn--block">Show in the room</Link>
      <div className="grid-2">
        <Link to="/brief/doctor?print=1" className="btn">Export as pdf</Link>
        <button className="btn" onClick={async () => showToast(await shareText('My visit brief', caseAsText(state)))}>Share</button>
      </div>
      <Link to="/today" className="btn btn--link" style={{ alignSelf: 'center' }}>Morning-of prep →</Link>
      {toast}
    </Shell>
  );
}

function suggestionsFrom(symptoms?: string): string[] {
  if (!symptoms || symptoms === 'Not discussed') return [];
  return symptoms.split('; ');
}

function Priorities({ visit, update, suggestions }: { visit: Visit; update: (p: Partial<Visit>) => void; suggestions: string[] }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const items = visit.priorities;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    update({ priorities: next });
  };
  const add = (text: string) => {
    const t = text.trim();
    if (!t || items.length >= MAX_PRIORITIES) return;
    if (hasCrisisLanguage(t)) {
      navigate('/help/now');
      return;
    }
    update({ priorities: [...items, t] });
    setDraft('');
  };
  const unused = suggestions.filter((s) => !items.includes(s));

  return (
    <section className="card" aria-labelledby="prio">
      <h3 id="prio">Top priorities (drag to reorder)</h3>
      {items.length === 0 && <p className="muted small">Add up to three things you most need to cover.</p>}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((p, i) => (
          <li
            key={p + i}
            className="priority"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }}
            style={dragIndex === i ? { opacity: 0.5 } : undefined}
          >
            <span className="drag-handle" aria-hidden="true"><IconGrip /></span>
            <span className="priority__text">{i + 1}. {p}</span>
            <button className="icon-btn" aria-label={`Move "${p}" up`} disabled={i === 0} onClick={() => move(i, i - 1)}><IconUp width={16} height={16} /></button>
            <button className="icon-btn" aria-label={`Move "${p}" down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><IconDown width={16} height={16} /></button>
            <button className="icon-btn" aria-label={`Remove "${p}"`} onClick={() => update({ priorities: items.filter((_, j) => j !== i) })}><IconTrash width={16} height={16} /></button>
          </li>
        ))}
      </ol>
      {items.length < MAX_PRIORITIES && (
        <>
          {unused.length > 0 && (
            <div className="stack-sm">
              <span className="small muted">From your story:</span>
              <div className="chips">
                {unused.slice(0, 4).map((s) => (
                  <button key={s} className="chip" onClick={() => add(s)}>+ {s}</button>
                ))}
              </div>
            </div>
          )}
          <form className="row" onSubmit={(e) => { e.preventDefault(); add(draft); }}>
            <label htmlFor="newp" className="sr-only">Add a priority</label>
            <input id="newp" className="input" placeholder="Add a priority in your words" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn btn--sm" type="submit" disabled={!draft.trim()}>Add</button>
          </form>
        </>
      )}
    </section>
  );
}

function NoVisit() {
  const setNextVisit = useApp((s) => s.setNextVisit);
  const [date, setDate] = useState('');
  return (
    <Shell header={{ kind: 'sub', back: '/home' }}>
      <h1>Your one - page brief</h1>
      <p className="lead">Add your next visit date and we’ll build your brief around it.</p>
      <div className="field">
        <label htmlFor="d">Next visit date</label>
        <input id="d" type="date" className="input" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn btn--primary btn--block" disabled={!date} onClick={() => setNextVisit(date)}>Start my brief</button>
    </Shell>
  );
}

/** "Show in the room": large-type, read-only view to hand the phone to the doctor. */
export function DoctorView() {
  const state = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const latest = selectLatestSummary(state);
  const visit = selectUpcomingVisit(state);
  const field = (k: string) => latest?.fields.find((f) => f.key === k);
  const printMode = params.get('print') === '1';

  useEffect(() => {
    if (!printMode) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [printMode]);

  const who = [state.profile?.name, state.profile?.age && `${state.profile.age} years`, visit && formatDate(visit.date)].filter(Boolean).join(', ');
  const timeline = [...state.evidence].sort((a, b) => a.date.localeCompare(b.date)).filter((e) => e.type !== 'note').slice(-5);

  return (
    <Shell header={{ kind: 'sub', title: 'For your Doctor', exit: true, onBack: () => navigate('/brief'), right: <span /> }} footer="prepared">
      <div className="doctor stack">
        <div>
          <span className="card__label">Patient summary</span>
          <h1>{who || 'Patient summary'}</h1>
        </div>

        {visit && visit.priorities.length > 0 && (
          <section className="card">
            <h3>Top priorities</h3>
            <ol className="list">{visit.priorities.map((p) => <li key={p}>{p}</li>)}</ol>
          </section>
        )}

        {latest && (
          <section className="card">
            <h3>Symptoms</h3>
            <div className="kv">
              {['symptoms', 'onset', 'frequency', 'severity', 'triggers'].map((k) => {
                const f = field(k);
                if (!f || f.clinical === 'Not discussed') return null;
                return (
                  <div className="kv__row" key={k}>
                    <span><strong>{f.key === 'symptoms' ? 'Reported' : f.label}:</strong> {f.clinical}</span>
                    {f.quote && <span className="kv__quote">In my words: “{f.quote}”</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="card card--soft">
          <h3>Already tried</h3>
          <p>{field('tried')?.clinical !== 'Not discussed' && field('tried')?.clinical
            ? field('tried')!.clinical
            : state.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''} since ${formatDate(m.started)}`).join('; ') || 'Not discussed'}</p>
        </section>

        {timeline.length > 0 && (
          <section className="card card--soft">
            <h3>Timeline</h3>
            <ul className="list">{timeline.map((e) => <li key={e.id}><strong>{formatDate(e.date)}:</strong> {e.detail}</li>)}</ul>
          </section>
        )}

        <section className="card card--soft">
          <h3>Asking for</h3>
          <p>{visit?.askingFor.length ? visit.askingFor.join(' · ') : 'To discuss together'}</p>
        </section>

        {state.demoMode && <p className="small muted">Synthetic — illustrative only, not medical advice.</p>}
      </div>
    </Shell>
  );
}
