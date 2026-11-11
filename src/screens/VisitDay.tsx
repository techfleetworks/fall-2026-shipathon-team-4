import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { formatDate } from '../lib/dates';
import { useApp } from '../lib/store';
import { SCRIPTS } from '../data/scripts';
import { ScriptCard } from './Scripts';

const BREATH_SECONDS = 60;
export function Breathing() {
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const done = elapsed >= BREATH_SECONDS;
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [done]);
  // 4s in, 6s out → 10s cycles
  const phase = elapsed % 10 < 4 ? 'in' : 'out';
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <Shell header={{ kind: 'sub', title: 'Breathe', back: 'history', right: <span /> }}>
      <h1>{done ? 'Nice. You’re ready.' : 'Breathe with the circle'}</h1>
      <p className="lead">In for 4, out for 6. Shoulders down.</p>
      <div
        className="breath"
        aria-live="polite"
        style={{ transform: reduceMotion || done ? 'scale(1)' : `scale(${phase === 'in' ? 1.25 : 0.85})`, transitionDuration: phase === 'in' ? '4s' : '6s' }}
      >
        {done ? 'Done' : phase === 'in' ? 'Breathe in' : 'Breathe out'}
      </div>
      <p className="muted" style={{ textAlign: 'center' }}>{done ? '60 seconds' : `${BREATH_SECONDS - elapsed}s left`}</p>
      <button className="btn btn--primary btn--block" onClick={() => navigate(-1)}>{done ? 'Back' : 'Stop'}</button>
    </Shell>
  );
}

export function Escalation() {
  const scripts = SCRIPTS.filter((s) => s.category === 'Escalate' || s.id === 'doc-declined' || s.id === 'doc-chart');
  return (
    <Shell header={{ kind: 'sub', title: 'No clear next step', back: '/home', backLabel: 'Home', right: <span /> }} tabs>
      <h1>You can still ask.</h1>
      <p className="lead">Leaving without a plan is common — and you can follow up. Call the office or send a portal message with one of these.</p>
      {scripts.map((s) => <ScriptCard key={s.id} script={s} />)}
      <Link to="/home" className="btn btn--block">Back to Home</Link>
    </Shell>
  );
}

export function FollowUpScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const f = useApp((s) => s.followUps.find((x) => x.id === id));
  const log = useApp((s) => s.logFollowUp);
  if (!f) return <Navigate to="/home" replace />;

  const choose = (o: 'Happened' | 'Not yet' | 'Didn’t happen') => {
    log(f.id, o);
    navigate(o === 'Happened' ? '/playbooks/rate' : '/escalation', { replace: true });
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Follow up', back: '/home', backLabel: 'Home', right: <span /> }}>
      <span className="badge">Due {formatDate(f.dueDate)}</span>
      <h1>Did the {f.step.toLowerCase()} happen?</h1>
      <p className="lead">Logging it keeps your case complete — and gives you something concrete to point to next time.</p>
      <button className="btn btn--primary btn--block" onClick={() => choose('Happened')}>Yes, it happened</button>
      <button className="btn btn--block" onClick={() => choose('Not yet')}>Not yet</button>
      <button className="btn btn--block" onClick={() => choose('Didn’t happen')}>It didn’t happen</button>
    </Shell>
  );
}
