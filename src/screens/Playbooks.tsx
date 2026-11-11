import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { IconTrash } from '../components/Icons';
import { ChipSelect, ConfirmButton, Disclaimer, useToast } from '../components/ui';
import { PLAYBOOKS } from '../data/playbooks';
import { SCRIPTS } from '../data/scripts';
import { formatDate } from '../lib/dates';
import { draftPlaybook } from '../lib/playbook';
import { hasCrisisLanguage } from '../lib/safety';
import { selectLatestSummary, useApp } from '../lib/store';
import type { SharedTip } from '../lib/types';
import { ScriptCard } from './Scripts';

/** Playbooks header + in-page tabs: My playbooks (made for you) · Others' playbooks (site map). */
function PlaybooksLayout({ tab, children }: { tab: 'mine' | 'others'; children: ReactNode }) {
  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <h1>Playbooks</h1>
      <nav className="tabs tabs--links" aria-label="Playbooks">
        <Link to="/playbooks" aria-current={tab === 'mine' ? 'page' : undefined}>Made for me</Link>
        <Link to="/playbooks/others" aria-current={tab === 'others' ? 'page' : undefined}>Others’ playbooks</Link>
      </nav>
      {children}
    </Shell>
  );
}

/* ---------- Made for me: make one, saved playbooks, saved scripts ---------- */
export function MyPlaybooks() {
  const myPlaybooks = useApp((s) => s.myPlaybooks) ?? [];
  const savedScripts = useApp((s) => s.savedScripts);
  const list = [...myPlaybooks].reverse();
  return (
    <PlaybooksLayout tab="mine">
      <section className="card card--feature">
        <span className="card__label">For your next visit</span>
        <h2 style={{ fontSize: '1.1rem' }}>Make a playbook for my visit</h2>
        <p>We put your priorities, an opening line and the right scripts on one page, so you know what to say.</p>
        <Link to="/playbooks/new" className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>Make my playbook</Link>
      </section>

      <h2 className="section-label">Saved playbooks</h2>
      {list.length === 0 && <p className="small muted">None yet. Playbooks you make are saved here.</p>}
      {list.map((p) => (
        <Link key={p.id} to={`/playbooks/mine/${p.id}`} className="card card--link">
          <span className="card__title">{p.title}</span>
          <span className="small muted">Made {formatDate(p.createdAt.slice(0, 10))} · {p.scriptIds.length} scripts</span>
        </Link>
      ))}

      <h2 className="section-label">Saved scripts</h2>
      {savedScripts.length === 0 ? (
        <p className="small muted">Tap Save on any script to keep it here.</p>
      ) : (
        SCRIPTS.filter((s) => savedScripts.includes(s.id)).map((s) => <ScriptCard key={s.id} script={s} />)
      )}
      <Link to="/scripts" className="btn btn--block">Browse the script library</Link>
    </PlaybooksLayout>
  );
}

/* ---------- Make a playbook for my visit ---------- */
export function NewPlaybook() {
  const state = useApp();
  const navigate = useNavigate();
  const draft = useMemo(() => draftPlaybook(state), [state]);
  const latest = selectLatestSummary(state);

  return (
    <Shell header={{ kind: 'sub', title: 'New playbook', back: '/playbooks', backLabel: '‹ Playbooks' }}>
      <span className="eyebrow">Draft</span>
      <h1>Your playbook {draft.title.toLowerCase().startsWith('for') ? draft.title.charAt(0).toLowerCase() + draft.title.slice(1) : draft.title}</h1>
      {!latest && (
        <div className="card card--muted">
          <p className="small">This works best after you tell your story. For now it uses general scripts.</p>
          <Link to="/story" className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>Tell my story first</Link>
        </div>
      )}
      <PlaybookBody p={draft} />
      <button className="btn btn--primary btn--block" onClick={() => navigate(`/playbooks/mine/${state.savePlaybook(draft)}`, { replace: true })}>
        Save playbook
      </button>
      <p className="small muted">Built from what you’ve saved. Change your priorities in your <Link to="/brief">visit brief</Link>.</p>
    </Shell>
  );
}

type PlaybookLike = ReturnType<typeof draftPlaybook>;

function PlaybookBody({ p }: { p: PlaybookLike }) {
  const peer = PLAYBOOKS.find((x) => x.id === p.peerPlaybookId);
  return (
    <>
      <section className="card">
        <span className="card__label">Start with</span>
        <div className="quote"><p>“{p.opening}”</p></div>
      </section>
      {p.priorities.length > 0 && (
        <section className="card">
          <span className="card__label">Top priorities</span>
          <ol className="list">{p.priorities.map((x) => <li key={x}>{x}</li>)}</ol>
        </section>
      )}
      <h2 className="section-label">If you’re brushed off</h2>
      {p.scriptIds.map((id) => {
        const s = SCRIPTS.find((x) => x.id === id);
        return s ? <ScriptCard key={id} script={s} /> : null;
      })}
      <section className="card card--soft">
        <span className="card__label">What I’m asking for</span>
        <p>{p.askingFor.length ? p.askingFor.join(' · ') : 'To agree a clear next step before I leave.'}</p>
      </section>
      {peer && (
        <Link to={`/playbooks/others/${peer.id}`} className="card card--link card--soft">
          <span className="card__label">From others in a similar spot</span>
          <span className="card__title">{peer.title}</span>
        </Link>
      )}
      <Disclaimer />
    </>
  );
}

export function MyPlaybookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const p = useApp((s) => (s.myPlaybooks ?? []).find((x) => x.id === id));
  const deletePlaybook = useApp((s) => s.deletePlaybook);
  if (!p) return <Navigate to="/playbooks" replace />;
  return (
    <Shell header={{ kind: 'sub', title: 'My playbook', back: '/playbooks', backLabel: '‹ Playbooks' }} tabs>
      <h1>{p.title}</h1>
      <Link to={`/playbooks/mine/${p.id}/practice`} className="btn btn--primary btn--block">Practice it</Link>
      <PlaybookBody p={p} />
      <ConfirmButton
        className="btn btn--block btn--outline-danger"
        question="Delete this playbook?"
        confirmLabel="Delete"
        onConfirm={() => { deletePlaybook(p.id); navigate('/playbooks', { replace: true }); }}
      >
        <IconTrash width={16} height={16} /> Delete playbook
      </ConfirmButton>
    </Shell>
  );
}

/* ---------- Practice it: say each line out loud, one at a time ---------- */
export function PracticePlaybook() {
  const { id } = useParams();
  const p = useApp((s) => (s.myPlaybooks ?? []).find((x) => x.id === id));
  const [i, setI] = useState(0);
  if (!p) return <Navigate to="/playbooks" replace />;
  const lines = [
    { label: 'Start with', text: p.opening, scriptId: undefined as string | undefined },
    ...p.scriptIds.map((sid) => SCRIPTS.find((s) => s.id === sid)).filter(Boolean).map((s) => ({ label: s!.situation, text: s!.text, scriptId: s!.id })),
  ];
  const done = i >= lines.length;
  const line = lines[Math.min(i, lines.length - 1)];

  return (
    <Shell header={{ kind: 'sub', title: 'Practice', back: `/playbooks/mine/${p.id}`, right: <span /> }}>
      <span className="eyebrow">{done ? 'All done' : `Line ${i + 1} of ${lines.length}`}</span>
      {done ? (
        <>
          <h1>You’re ready.</h1>
          <p className="lead">Saying it before the visit makes it easier in the room.</p>
          <button className="btn btn--block" onClick={() => setI(0)}>Practice again</button>
          <Link to={`/playbooks/mine/${p.id}`} className="btn btn--primary btn--block">Back to my playbook</Link>
        </>
      ) : (
        <>
          <h1>{line.label}</h1>
          <div className="card card--muted doctor">
            <p style={{ fontSize: '1.2rem', lineHeight: 1.5 }}>“<Highlighted text={line.text} />”</p>
          </div>
          <p className="small muted">Read it out loud, slowly. Swap the highlighted parts for your own details.</p>
          {line.scriptId && <Link to={`/scripts/${line.scriptId}/practice`} className="btn btn--link">Fill in my details →</Link>}
          <button className="btn btn--primary btn--block" onClick={() => setI(i + 1)}>I said it</button>
        </>
      )}
    </Shell>
  );
}

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, k) =>
        part.startsWith('[') ? <span key={k} style={{ color: 'var(--primary)', fontWeight: 600 }}>{part}</span> : <Fragment key={k}>{part}</Fragment>,
      )}
    </>
  );
}

/* ---------- Others' playbooks ---------- */
export function OthersPlaybooks() {
  const tips = useApp((s) => s.sharedTips);
  return (
    <PlaybooksLayout tab="others">
      <p className="lead">What worked for people dismissed in similar ways.</p>
      <p className="small muted">Examples are synthetic for now — built from common dismissal patterns, not real people.</p>
      {PLAYBOOKS.map((p) => {
        const ratings = tips.filter((t) => t.playbookId === p.id && t.rating).length;
        return (
          <Link key={p.id} to={`/playbooks/others/${p.id}`} className="card card--link">
            <span className="badge badge--soft">{p.pattern}</span>
            <span className="card__title">{p.title}</span>
            <span className="muted small">{p.summary}</span>
            {ratings > 0 && <span className="small muted">You rated this</span>}
          </Link>
        );
      })}
    </PlaybooksLayout>
  );
}

export function OthersPlaybookDetail() {
  const { id } = useParams();
  const p = PLAYBOOKS.find((x) => x.id === id);
  if (!p) return <Navigate to="/playbooks/others" replace />;
  return (
    <Shell header={{ kind: 'sub', title: 'Playbook', back: '/playbooks/others', backLabel: '‹ Others’' }} tabs>
      <span className="badge badge--soft">{p.pattern}</span>
      <h1>{p.title}</h1>
      <p className="lead">{p.summary}</p>
      <section className="card">
        <h3>What helped</h3>
        <ol className="list">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>
      <div className="card card--muted"><p>{p.fromPeer}</p><span className="small muted">— from a peer (synthetic example)</span></div>
      <h2 className="section-label">Scripts for this</h2>
      {p.scriptIds.map((sid) => {
        const s = SCRIPTS.find((x) => x.id === sid);
        return s ? <ScriptCard key={sid} script={s} /> : null;
      })}
      <Link to={`/playbooks/rate?p=${p.id}`} className="btn btn--primary btn--block">Did it help? Rate it</Link>
    </Shell>
  );
}

/* ---------- Did it help? (rate) — also "Share what helped" after a visit ---------- */
export function RatePlaybook() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const addTip = useApp((s) => s.addTip);
  const anonymousRatings = useApp((s) => !!s.profile?.consent?.anonymousRatings);
  const [playbookId, setPlaybookId] = useState<string | undefined>(params.get('p') ?? undefined);
  const [rating, setRating] = useState<SharedTip['rating']>();
  const [text, setText] = useState('');
  const [toast, showToast] = useToast();
  const playbook = PLAYBOOKS.find((p) => p.id === playbookId);

  const save = () => {
    if (hasCrisisLanguage(text)) {
      navigate('/help/now', { replace: true });
      return;
    }
    addTip({ text: text.trim(), rating, playbookId });
    showToast('Saved — thank you');
    setTimeout(() => navigate(playbookId ? `/playbooks/others/${playbookId}` : '/playbooks/others'), 700);
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Did it help?', back: 'history' }}>
      <h1>Did it help?</h1>
      <p className="lead">Your rating helps the next person walk in prepared.</p>
      <div className="field">
        <label htmlFor="pb">Which playbook?</label>
        <select id="pb" className="select input" value={playbookId ?? ''} onChange={(e) => setPlaybookId(e.target.value || undefined)}>
          <option value="">A script or something else</option>
          {PLAYBOOKS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div className="field">
        <span className="label">{playbook ? 'Did this playbook help?' : 'Did it help?'}</span>
        <ChipSelect label="Did it help" options={['Yes', 'A little', 'No']} value={rating} onChange={(v) => setRating(v as SharedTip['rating'])} />
      </div>
      <div className="field">
        <label htmlFor="tip">What would you tell someone in your shoes? <span className="muted">(optional)</span></label>
        <textarea id="tip" className="textarea" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Leading with the date the side effect started made them listen." />
      </div>
      <div className="card card--muted">
        <p className="small">
          Leave out names, places and anything that could identify you or your doctor. In this version your rating stays on this device.
          {anonymousRatings
            ? ' You’ve allowed anonymous ratings, so it will be shared without your name once sharing is live.'
            : ' Sharing with others is off. You can turn on anonymous ratings in Settings → Privacy and data.'}
        </p>
      </div>
      <button className="btn btn--primary btn--block" disabled={!rating && !text.trim()} onClick={save}>Save my rating</button>
      <Link to="/home" className="btn btn--block">Skip</Link>
      {toast}
    </Shell>
  );
}
