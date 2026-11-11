import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Disclaimer } from '../components/ui';
import { requestPrepSummary } from '../lib/api';
import { storyDraftHasCrisis } from '../lib/guardrails/enforce';
import { hasCrisisLanguage } from '../lib/safety';
import { useApp, useDraft } from '../lib/store';
import type { SummaryField } from '../lib/types';

type Phase = { s: 'loading' } | { s: 'ok' } | { s: 'blocked'; message: string } | { s: 'error'; message: string };

export function Translation() {
  const navigate = useNavigate();
  const { draft, reset } = useDraft();
  const saveSummary = useApp((s) => s.saveSummary);
  const [fields, setFields] = useState<SummaryField[]>([]);
  const [phase, setPhase] = useState<Phase>({ s: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [serverCrisis, setServerCrisis] = useState(false);
  const [editing, setEditing] = useState<string | 'all' | null>(null);
  // Set once this screen has sent the person to crisis support; after that it never contacts the server.
  const leftForCrisis = useRef(false);

  // The story draft is restored from session storage; wait until that's done before deciding anything,
  // so a half-loaded (empty) draft is never what gets checked or sent.
  const [hydrated, setHydrated] = useState(() => useDraft.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useDraft.persist.onFinishHydration(() => setHydrated(true));
    if (useDraft.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  // Crisis is checked on the device first, so crisis text is never sent. The server checks again.
  const localCrisis = hydrated && storyDraftHasCrisis(draft);

  // The backend server turns the story into doctor terms: engine + guardrails run there
  // (POST /api/prep-summary). Runs once on arrival, and again on "Try again".
  useEffect(() => {
    if (!hydrated || leftForCrisis.current) return;
    // Re-check the latest draft right before sending: crisis text must never leave the device.
    const current = useDraft.getState().draft;
    if (storyDraftHasCrisis(current)) return;
    const ctrl = new AbortController();
    setPhase({ s: 'loading' });
    requestPrepSummary(current, { signal: ctrl.signal }).then((out) => {
      if (ctrl.signal.aborted) return;
      if (out.status === 'ok') {
        setFields(out.fields);
        setPhase({ s: 'ok' });
      } else if (out.status === 'crisis') setServerCrisis(true);
      else if (out.status === 'blocked') setPhase({ s: 'blocked', message: out.message });
      else if (out.status === 'rejected' && out.error.code === 'EMPTY_STORY') navigate('/story', { replace: true });
      else setPhase({ s: 'error', message: out.status === 'rejected' ? out.error.message : out.message });
    });
    return () => ctrl.abort();
    // Deliberately only on arrival and retry: the draft doesn't change on this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, hydrated]);

  // Backstop: crisis language anywhere in the story (or flagged by the server) goes to crisis support and is
  // never turned into a summary or brief, whatever path led here (Skip, Save and resume, back navigation).
  const crisis = localCrisis || serverCrisis;
  useEffect(() => {
    if (!crisis) return;
    leftForCrisis.current = true;
    reset();
    navigate('/help/now', { replace: true });
  }, [crisis, reset, navigate]);
  if (crisis) return null;

  if (phase.s === 'loading') {
    return (
      <Shell header={{ kind: 'sub', back: '/story/5' }}>
        <h1>Here’s how a doctor would read it</h1>
        <p className="lead" role="status">Putting your words into doctor terms…</p>
      </Shell>
    );
  }

  if (phase.s === 'error') {
    return (
      <Shell header={{ kind: 'sub', back: '/story/5' }}>
        <h1>Here’s how a doctor would read it</h1>
        <div className="card card--danger" role="alert">{phase.message}</div>
        <button className="btn btn--primary btn--block" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        <Link to="/story" className="btn btn--block">Back to my story</Link>
      </Shell>
    );
  }

  // A rule was broken: show the honest fallback instead of the output. Nothing can be saved from here.
  if (phase.s === 'blocked') {
    return (
      <Shell header={{ kind: 'sub', back: '/story/5' }}>
        <h1>Let’s put this in your words</h1>
        <p className="lead">{phase.message}</p>
        <Link to="/story" className="btn btn--primary btn--block">Back to my story</Link>
        <Disclaimer />
      </Shell>
    );
  }

  const isEmpty = fields.every((f) => f.clinical === 'Not discussed') && !draft.opening.trim();
  if (isEmpty) return <Navigate to="/story" replace />;

  const setClinical = (key: string, clinical: string) =>
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, clinical, editedByPatient: true } : f)));

  const save = () => {
    if (storyDraftHasCrisis(draft) || fields.some((f) => hasCrisisLanguage(f.clinical, f.quote))) {
      reset();
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
