import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Disclaimer } from '../components/ui';
import { hasCrisisLanguage } from '../lib/safety';
import { useApp, useDraft } from '../lib/store';
import { translateStory } from '../lib/translate';
import type { SummaryField } from '../lib/types';

export function Translation() {
  const navigate = useNavigate();
  const { draft, reset } = useDraft();
  const saveSummary = useApp((s) => s.saveSummary);
  const [fields, setFields] = useState<SummaryField[]>(() => translateStory(draft));
  const [editing, setEditing] = useState<string | 'all' | null>(null);

  const isEmpty = fields.every((f) => f.clinical === 'Not discussed') && !draft.opening.trim();
  if (isEmpty) return <Navigate to="/story" replace />;

  const setClinical = (key: string, clinical: string) =>
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, clinical, editedByPatient: true } : f)));

  const save = () => {
    if (fields.some((f) => f.editedByPatient && hasCrisisLanguage(f.clinical))) {
      navigate('/help/now', { replace: true });
      return;
    }
    saveSummary({ opening: draft.opening.trim(), fields });
    reset();
    navigate('/story/saved', { replace: true });
  };

  return (
    <Shell header={{ kind: 'sub', back: '/story/5' }}>
      <h1>Here’s how a doctor would read it</h1>

      <div className="card card--muted">
        <span className="card__label">You said</span>
        <p>{draft.opening.trim() ? `“${draft.opening.trim()}”` : <span className="muted">You skipped the opening — that’s okay.</span>}</p>
      </div>

      <div className="card">
        <h3>Clinical terms</h3>
        <div className="kv">
          {fields.map((f) => {
            const isEditing = editing === 'all' || editing === f.key;
            return (
              <div key={f.key} className="kv__row">
                {isEditing ? (
                  <div className="field">
                    <label htmlFor={`f-${f.key}`}><strong>{f.label}</strong></label>
                    <textarea
                      id={`f-${f.key}`}
                      className="textarea"
                      style={{ minHeight: 64 }}
                      value={f.clinical === 'Not discussed' ? '' : f.clinical}
                      placeholder="Not discussed"
                      onChange={(e) => setClinical(f.key, e.target.value || 'Not discussed')}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(f.key)}
                    style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                    aria-label={`Edit ${f.label}`}
                  >
                    <strong>{f.label}:</strong>{' '}
                    <span className={f.clinical === 'Not discussed' ? 'muted' : undefined}>{f.clinical}</span>
                    {f.editedByPatient && <span className="badge badge--soft" style={{ marginLeft: 6, fontSize: '0.75rem' }}>your wording</span>}
                  </button>
                )}
                {f.quote && <span className="kv__quote">Your words: “{f.quote}”</span>}
              </div>
            );
          })}
        </div>
        <button className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(editing ? null : 'all')}>
          {editing ? 'Done editing' : 'Edit wording'}
        </button>
      </div>

      <p className="small">Something wrong? Tap any line to change it. Your words stay attached — and your wording always wins.</p>
      <Disclaimer />

      <button className="btn btn--primary btn--block" onClick={save}>Looks right - Save to my case</button>
    </Shell>
  );
}

export function StorySaved() {
  return (
    <Shell header={{ kind: 'sub', title: 'Saved', back: '/home', backLabel: 'Home' }} tabs>
      <span className="badge">Saved to My case</span>
      <h1>That was the hard part.</h1>
      <p className="lead">Your doctor-ready summary is saved with today’s date, next to your own words.</p>
      <div className="card card--feature">
        <span className="card__label">Next</span>
        <h2 style={{ fontSize: '1.05rem' }}>Build your one-page brief</h2>
        <p>Pick your top 3 priorities and what you’re asking for. Thirty minutes go fast.</p>
        <Link to="/brief" className="btn btn--primary btn--block">Build my visit brief</Link>
      </div>
      <Link to="/case" className="btn btn--block">See My case</Link>
    </Shell>
  );
}
