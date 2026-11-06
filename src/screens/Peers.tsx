import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ChipSelect, useToast } from '../components/ui';
import { PLAYBOOKS } from '../data/playbooks';
import { SCRIPTS } from '../data/scripts';
import { hasCrisisLanguage } from '../lib/safety';
import { useApp } from '../lib/store';
import { ScriptCard } from './Scripts';

export function Peers() {
  const tips = useApp((s) => s.sharedTips);
  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <h1>Peer playbooks</h1>
      <p className="lead">What worked for people dismissed in similar ways.</p>
      <p className="small muted">Examples are synthetic for now — built from common dismissal patterns, not real people.</p>
      {PLAYBOOKS.map((p) => (
        <Link key={p.id} to={`/peers/${p.id}`} className="card card--link">
          <span className="badge badge--soft">{p.pattern}</span>
          <span className="card__title">{p.title}</span>
          <span className="muted small">{p.summary}</span>
        </Link>
      ))}
      <Link to="/peers/share" className="btn btn--block">Share what helped you</Link>
      {tips.length > 0 && (
        <>
          <h2 className="section-label">What you’ve shared</h2>
          {tips.map((t) => <div key={t.id} className="card card--soft"><p>“{t.text}”</p></div>)}
        </>
      )}
    </Shell>
  );
}

export function PlaybookDetail() {
  const { id } = useParams();
  const p = PLAYBOOKS.find((x) => x.id === id);
  if (!p) return <Navigate to="/peers" replace />;
  return (
    <Shell header={{ kind: 'sub', title: 'Playbook', back: '/peers' }} tabs>
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
      <Link to={`/peers/share?p=${p.id}`} className="btn btn--block">Share what helped you</Link>
    </Shell>
  );
}

export function ShareWhatHelped() {
  const navigate = useNavigate();
  const addTip = useApp((s) => s.addTip);
  const [helped, setHelped] = useState<string>();
  const [text, setText] = useState('');
  const [toast, showToast] = useToast();
  const playbookId = new URLSearchParams(location.search).get('p') ?? undefined;

  const save = () => {
    if (hasCrisisLanguage(text)) {
      navigate('/help/now', { replace: true });
      return;
    }
    addTip({ text: text.trim() || `A script helped: ${helped}`, playbookId });
    showToast('Saved — thank you');
    setTimeout(() => navigate('/home'), 700);
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Share what helped', back: 'history' }}>
      <h1>Did a script help?</h1>
      <p className="lead">Your tip can help the next person walk in prepared.</p>
      <ChipSelect label="Did a script help" options={['Yes', 'A little', 'No']} value={helped} onChange={setHelped} />
      <div className="field">
        <label htmlFor="tip">What would you tell someone in your shoes?</label>
        <textarea id="tip" className="textarea" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Leading with the date the side effect started made them listen." />
      </div>
      <div className="card card--muted">
        <p className="small">
          Leave out names, places and anything that could identify you or your doctor. In this version your tip stays on this device;
          anonymous sharing with others comes later and will always ask first.
        </p>
      </div>
      <button className="btn btn--primary btn--block" disabled={!helped && !text.trim()} onClick={save}>Save my tip</button>
      <Link to="/home" className="btn btn--block">Skip</Link>
      {toast}
    </Shell>
  );
}
