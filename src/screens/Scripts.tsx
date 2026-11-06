import { Fragment, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Chip } from '../components/ui';
import { SCRIPTS, SCRIPT_CATEGORIES, type Script } from '../data/scripts';
import { useApp } from '../lib/store';

export function Scripts() {
  const signedIn = useApp((s) => !!s.profile?.onboarded);
  const saved = useApp((s) => s.savedScripts);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const category = params.get('c') ?? (signedIn ? 'Being dismissed' : null);
  const savedOnly = params.get('saved') === '1';

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCRIPTS.filter((s) => {
      if (savedOnly) return saved.includes(s.id);
      if (q) return (s.situation + ' ' + s.text + ' ' + s.category).toLowerCase().includes(q);
      return !category || s.category === category;
    });
  }, [query, category, savedOnly, saved]);

  const pick = (c: string | null, savedFlag = false) => {
    setQuery('');
    const next = new URLSearchParams();
    if (c) next.set('c', c);
    if (savedFlag) next.set('saved', '1');
    setParams(next, { replace: true });
  };

  return (
    <Shell header={signedIn ? { kind: 'brand' } : { kind: 'sub', title: 'Scripts', back: 'history' }} tabs={signedIn}>
      {signedIn && <h1 style={{ color: 'var(--primary)' }} className="sr-only">Scripts</h1>}
      <div className="field">
        <label htmlFor="q" className="muted">Search</label>
        <input id="q" className="input" type="search" placeholder="What do I say if…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label="Categories">
        {SCRIPT_CATEGORIES.map((c) => (
          <Chip key={c} selected={!query && !savedOnly && category === c} onClick={() => pick(c)}>{c}</Chip>
        ))}
        {signedIn && <Chip selected={savedOnly} onClick={() => pick(null, !savedOnly)}>Saved ({saved.length})</Chip>}
      </div>

      {list.length === 0 && (
        <p className="muted">{savedOnly ? 'No saved scripts yet. Tap Save on any script to keep it handy.' : 'No scripts match. Try another word.'}</p>
      )}
      {list.map((s) => <ScriptCard key={s.id} script={s} />)}
      <p className="small muted">Scripts are starting points — change the words so they sound like you.</p>
    </Shell>
  );
}

/** Renders "[placeholder]" segments in a muted style. */
function ScriptText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <p>
      “{parts.map((p, i) => (p.startsWith('[') ? <span key={i} style={{ color: 'var(--primary)', fontWeight: 600 }}>{p}</span> : <Fragment key={i}>{p}</Fragment>))}”
    </p>
  );
}

export function ScriptCard({ script }: { script: Script }) {
  const signedIn = useApp((s) => !!s.profile?.onboarded);
  const isSaved = useApp((s) => s.savedScripts.includes(script.id));
  const toggle = useApp((s) => s.toggleScript);
  return (
    <article className="card">
      <h3>{script.situation}</h3>
      <div className="quote"><ScriptText text={script.text} /></div>
      <div className="grid-2">
        {signedIn ? (
          <button className={`btn${isSaved ? ' btn--primary' : ''}`} aria-pressed={isSaved} onClick={() => toggle(script.id)}>
            {isSaved ? 'Saved' : 'Save'}
          </button>
        ) : <span />}
        <Link to={`/scripts/${script.id}/practice`} className="btn">Practice</Link>
      </div>
    </article>
  );
}

/** Practice: fill in the blanks with your own details, then say it out loud. */
export function PracticeScript() {
  const { id } = useParams();
  const script = SCRIPTS.find((s) => s.id === id);
  const meds = useApp((s) => s.medications);
  const [values, setValues] = useState<Record<number, string>>({});
  const [reps, setReps] = useState(0);
  if (!script) return <Navigate to="/scripts" replace />;

  const parts = script.text.split(/(\[[^\]]+\])/g);
  const defaultFor = (ph: string) => (/med/i.test(ph) && meds[0] ? meds[0].name : '');
  const filled = parts
    .map((p, i) => (p.startsWith('[') ? values[i] ?? defaultFor(p) ?? '' : p))
    .map((p, i) => (parts[i].startsWith('[') && !p ? parts[i] : p))
    .join('');

  return (
    <Shell header={{ kind: 'sub', title: 'Practice', back: 'history' }}>
      <h1>{script.situation}</h1>
      <p className="lead">Fill in your details, then read it out loud three times. Saying it before the visit makes it easier in the room.</p>

      <section className="card">
        {parts.map((p, i) =>
          p.startsWith('[') ? (
            <div className="field" key={i}>
              <label htmlFor={`ph${i}`}>{p.slice(1, -1)}</label>
              <input id={`ph${i}`} className="input" value={values[i] ?? defaultFor(p)} onChange={(e) => setValues({ ...values, [i]: e.target.value })} />
            </div>
          ) : null,
        )}
        {!parts.some((p) => p.startsWith('[')) && <p className="muted small">Nothing to fill in for this one.</p>}
      </section>

      <div className="card card--muted doctor">
        <p style={{ fontSize: '1.2rem', lineHeight: 1.5 }}>“{filled}”</p>
      </div>

      <div className="row row--between">
        <span className="muted">Said out loud: {reps} / 3</span>
        <button className="btn btn--primary" onClick={() => setReps((r) => Math.min(3, r + 1))} disabled={reps >= 3}>
          {reps >= 3 ? 'Great — you’re ready' : 'I said it'}
        </button>
      </div>
      <p className="small muted">Tip: slow down, and pause after the question. Silence is okay.</p>
    </Shell>
  );
}
