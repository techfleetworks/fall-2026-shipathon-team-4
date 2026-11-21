import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SharedCase } from '../components/SharedCase';
import { IconDown, IconGrip, IconTrash, IconUp } from '../components/Icons';
import { formatDate, formatShort } from '../lib/dates';
import { hasCrisisLanguage } from '../lib/safety';
import type { BriefSnapshot, Visit } from '../lib/types';

export function suggestionsFrom(symptoms?: string): string[] {
  if (!symptoms || symptoms === 'Not discussed') return [];
  return symptoms.split('; ');
}

export function Priorities({ visit, update, suggestions, bare = false, addLink = false }: { visit: Visit; update: (p: Partial<Visit>) => void; suggestions: string[]; bare?: boolean; /** Show a "+ Add a priority" link that opens the input and suggestions. */ addLink?: boolean }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(!addLink);
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
    if (!t) return;
    if (hasCrisisLanguage(t)) {
      navigate('/help/now');
      return;
    }
    update({ priorities: [...items, t] });
    setDraft('');
    if (addLink) setAdding(false);
  };
  const unused = suggestions.filter((s) => !items.includes(s));

  return (
    <section className={bare ? 'stack' : 'card'} aria-label="Talking points">
      {!bare && <h3>Top priorities (drag to reorder)</h3>}
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
            <span className="priority__text"><strong>{i + 1}.</strong> {p}</span>
            <button className="icon-btn" aria-label={`Move "${p}" up`} disabled={i === 0} onClick={() => move(i, i - 1)}><IconUp width={16} height={16} /></button>
            <button className="icon-btn" aria-label={`Move "${p}" down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><IconDown width={16} height={16} /></button>
            <button className="icon-btn" aria-label={`Remove "${p}"`} onClick={() => update({ priorities: items.filter((_, j) => j !== i) })}><IconTrash width={16} height={16} /></button>
          </li>
        ))}
      </ol>
      {!adding && (
        <button type="button" className="link-btn priority-add" onClick={() => setAdding(true)}>+ Add a priority</button>
      )}
      {adding && (
        <>
          {!addLink && unused.length > 0 && (
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
            <input id="newp" className="input" autoFocus={addLink} placeholder="+ Add a priority, in your words" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (addLink && e.key === 'Escape') { setDraft(''); setAdding(false); } }} />
            <button className="btn btn--sm" type="submit" disabled={!draft.trim()}>Add</button>
            {addLink && <button type="button" className="link-btn" onClick={() => { setDraft(''); setAdding(false); }}>Cancel</button>}
          </form>
        </>
      )}
    </section>
  );
}

/** The doctor-facing brief (A1 layout). Shared by "Show in the room", the PDF and shared links. */
export function DoctorBriefBody({ data, showTimeline = false, variant = 'room', action }: { data: BriefSnapshot; showTimeline?: boolean; variant?: 'room' | 'shared'; /** A1: a button at the bottom of the right column ("Record this visit"). */ action?: ReactNode }) {
  const showSummary = data.includeSummary !== false;
  const showPoints = data.includeTalkingPoints !== false;
  const shared = variant === 'shared';
  const sharedTitle = data.patient
    ? ['Doctor summary', data.patient, data.visitDate && `for ${formatShort(data.visitDate)}`].filter(Boolean).join(' · ')
    : `Doctor summary${data.who ? ` · ${data.who}` : ''}`;
  return (
    <div className="room">
      <h1 className="room__who">{shared ? sharedTitle : data.who || 'Patient summary'}</h1>
      <div className={`room__grid${showPoints && data.priorities.length ? '' : ' room__grid--one'}`}>
        {showPoints && data.priorities.length > 0 && (
          <section className="room__card room__card--main">
            <span className="room__label">Top concerns</span>
            <ol className="room__concerns">{data.priorities.map((p) => <li key={p}>{p}</li>)}</ol>
          </section>
        )}
        <div className="room__side">
          {showSummary && data.symptoms.length > 0 && (
            <section className="room__card">
              <span className="room__label">Symptoms</span>
              {data.symptoms.map((f) => (
                <p key={f.label}><strong>{f.label}:</strong> {f.clinical}</p>
              ))}
            </section>
          )}
          {showSummary && data.tried && (
            <section className="room__card">
              <span className="room__label">{shared ? 'Treatment history' : 'Already tried'}</span>
              <p>{shared ? data.tried : <strong>{data.tried}</strong>}</p>
            </section>
          )}
          {shared && showSummary && data.impact && (
            <section className="room__card">
              <span className="room__label">Daily impact</span>
              <p>{data.impact}</p>
            </section>
          )}
          {showPoints && (!shared || data.askingFor.length > 0) && (
            <section className="room__card">
              <span className="room__label">Asking for</span>
              <p><strong>{data.askingFor.length ? data.askingFor.join(' · ') : 'To discuss together'}</strong></p>
            </section>
          )}
          {action && <div className="room__action">{action}</div>}
          {showTimeline && showSummary && data.timeline.length > 0 && (
            <section className="room__card">
              <span className="room__label">Timeline</span>
              {data.timeline.map((e, i) => <p key={i}><strong>{formatDate(e.date)}:</strong> {e.detail}</p>)}
            </section>
          )}
        </div>
      </div>
      {data.case && <SharedCase data={data.case} />}
      {data.demo && <p className="small muted">Synthetic — illustrative only, not medical advice.</p>}
    </div>
  );
}
