import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Checkbox, ChipMulti, ChipSelect } from '../components/ui';
import { addDays, formatDate, todayISO } from '../lib/dates';
import { hasCrisisLanguage } from '../lib/safety';
import { useApp } from '../lib/store';
import type { CheckIn, NextStepKind } from '../lib/types';
import { SCRIPTS } from '../data/scripts';
import { ScriptCard } from './Scripts';

const CHECKLIST = ['Read my top 3 priorities', 'Pick one script to keep handy', 'Bring: ID, med list, brief'];
const FEELINGS = ['Calm', 'Nervous', 'Overwhelmed'];

export function MorningPrep() {
  const { morning, setMorning } = useApp();
  const today = morning?.date === todayISO() ? morning : undefined;
  const checks = today?.checks ?? [];
  const toggle = (item: string, on: boolean) => setMorning({ checks: on ? [...checks, item] : checks.filter((c) => c !== item) });

  return (
    <Shell header={{ kind: 'sub', title: 'Today', back: '/home', backLabel: 'Home', right: <span /> }}>
      <h1>You’ve already done the hard part.</h1>
      <p className="lead">Three small things before your visit. Skip any.</p>

      <section className="card card--soft">
        <span className="card__label">How are you feeling right now?</span>
        <ChipSelect label="How are you feeling" options={FEELINGS} value={today?.feeling} onChange={(feeling) => setMorning({ feeling })} />
        {today?.feeling === 'Overwhelmed' && (
          <p className="small">That makes sense. Try the 60-second breathing below — and remember you can hand your phone to the doctor instead of saying it all.</p>
        )}
      </section>

      <section className="card">
        <span className="card__label">Checklist</span>
        {CHECKLIST.map((item) => (
          <Checkbox key={item} checked={checks.includes(item)} onChange={(on) => toggle(item, on)}>{item}</Checkbox>
        ))}
        <div className="row row--wrap small">
          <Link to="/brief">Priorities</Link>·<Link to="/scripts?saved=1">My scripts</Link>
        </div>
      </section>

      <section className="card card--muted">
        <span className="card__label">Optional · 60 seconds</span>
        <p>Slow breathing before you go in</p>
        <Link to="/breathe" className="btn" style={{ alignSelf: 'flex-start' }}>Start</Link>
      </section>

      <Link to="/brief/doctor" className="btn btn--primary btn--block">Open my brief</Link>
    </Shell>
  );
}

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

const NEXT_STEPS: NextStepKind[] = ['Referral', 'Test', 'Med change', 'Follow-up visit', 'None given'];

export function CheckInScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const visit = useApp((s) => s.visits.find((v) => v.id === id));
  const submit = useApp((s) => s.submitCheckIn);
  const [heard, setHeard] = useState<number>();
  const [steps, setSteps] = useState<NextStepKind[]>([]);
  const [due, setDue] = useState(addDays(todayISO(), 14));
  const [helped, setHelped] = useState<CheckIn['scriptHelped']>();
  const [note, setNote] = useState('');
  const submitted = useRef(false);

  if (!visit) return <Navigate to="/visits" replace />;
  if (visit.checkIn && !submitted.current) return <Navigate to={`/visits/${visit.id}/done`} replace />;

  const realSteps = steps.filter((s) => s !== 'None given');
  const setStepList = (v: string[]) => {
    const list = v as NextStepKind[];
    // "None given" is exclusive.
    const last = list[list.length - 1];
    setSteps(last === 'None given' ? ['None given'] : list.filter((x) => x !== 'None given'));
  };

  const save = () => {
    if (hasCrisisLanguage(note)) {
      navigate('/help/now', { replace: true });
      return;
    }
    submitted.current = true;
    submit(visit.id, { feltHeard: heard!, nextSteps: steps, dueDate: realSteps.length ? due : undefined, scriptHelped: helped, note: note.trim() || undefined });
    navigate(realSteps.length ? `/visits/${visit.id}/done` : '/escalation', { replace: true });
  };

  return (
    <Shell header={{ kind: 'sub', title: 'After your visit', back: '/home', backLabel: 'Home', right: <span /> }}>
      <h1>How did it go?</h1>
      <p className="lead">30 seconds. It helps you follow up and helps people like you.</p>
      <p className="small muted">Visit on {formatDate(visit.date)}{visit.clinician ? ` with ${visit.clinician}` : ''}</p>

      <section className="card">
        <h3>Did you feel heard?</h3>
        <div className="scale" role="group" aria-label="Felt heard, 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={heard === n} onClick={() => setHeard(n)}>{n}</button>
          ))}
        </div>
        <div className="row row--between small muted"><span>Not at all</span><span>Completely</span></div>
      </section>

      <section className="card">
        <span className="card__label">What’s the next step?</span>
        <ChipMulti label="Next step" options={NEXT_STEPS} value={steps} onChange={setStepList} />
        {realSteps.length > 0 && (
          <div className="field">
            <label htmlFor="due">When should it happen by?</label>
            <input id="due" type="date" className="input" min={todayISO()} value={due} onChange={(e) => setDue(e.target.value)} />
            <span className="small muted">We’ll ask you on that date if it happened.</span>
          </div>
        )}
      </section>

      <section className="card">
        <span className="card__label">Did a script or playbook help?</span>
        <ChipSelect label="Did a script help" options={['Yes', 'A little', 'No']} value={helped} onChange={(v) => setHelped(v as CheckIn['scriptHelped'])} />
      </section>

      <div className="field">
        <label htmlFor="note">Anything to remember? <span className="muted">(optional)</span></label>
        <textarea id="note" className="textarea" style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Said to push through for a month" />
      </div>

      <button className="btn btn--primary btn--block" disabled={!heard || steps.length === 0} onClick={save}>Save to my case</button>
    </Shell>
  );
}

export function CheckInDone() {
  const { id } = useParams();
  const visit = useApp((s) => s.visits.find((v) => v.id === id));
  const allFollowUps = useApp((s) => s.followUps);
  const followUps = allFollowUps.filter((f) => f.visitId === id);
  if (!visit?.checkIn) return <Navigate to="/home" replace />;
  const due = followUps[0]?.dueDate;
  return (
    <Shell header={{ kind: 'sub', title: 'Saved', back: '/home', backLabel: 'Home', right: <span /> }} tabs>
      <span className="badge">Saved to My case</span>
      <h1>Logged. You did it.</h1>
      {due && (
        <div className="card card--soft">
          <h3>Reminder set</h3>
          <p>On {formatDate(due)} we’ll ask: did the {followUps.map((f) => f.step.toLowerCase()).join(' and ')} happen?</p>
          <p className="small muted">You’ll see it on Home. Push notifications are coming with accounts.</p>
        </div>
      )}
      <Link to="/peers/share" className="btn btn--primary btn--block">Share what helped</Link>
      <Link to="/home" className="btn btn--block">Back to Home</Link>
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
    navigate(o === 'Happened' ? '/peers/share' : '/escalation', { replace: true });
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
