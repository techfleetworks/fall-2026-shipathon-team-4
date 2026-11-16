import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Chip, ChipSelect, useToast } from '../../components/ui';
import { SCRIPTS } from '../../data/scripts';
import { addDays, daysUntil, formatShort, todayISO } from '../../lib/dates';
import { hasCrisisLanguage } from '../../lib/safety';
import { shareText } from '../../lib/share';
import { useAfterVisitSummary } from '../../lib/afterVisit/useAfterVisitSummary';
import { useApp } from '../../lib/store';
import type { Answer3, CheckIn, FollowUp } from '../../lib/types';
import { useVisitParam, VisitLayout } from './common';

/* ======================================================================
   F1 · Recap — what the doctor said + your talking points
   ====================================================================== */

export function RecapStep() {
  const visit = useVisitParam();
  // Real users: summarize this visit's quick notes in plain words and add the action items (ADR-011, ADR-013).
  useAfterVisitSummary(visit);
  const navigate = useNavigate();
  const updateVisit = useApp((s) => s.updateVisit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [toast, showToast] = useToast();
  if (!visit) return <Navigate to="/visits" replace />;

  // No recap yet? Quick notes become the starting point. Patient confirms with "Fix something".
  const fromNotes = (visit.notes ?? '').split(/\n|(?<=[.?!])\s+/).map((l) => l.trim()).filter((l) => l.length > 2);
  const points = visit.recap?.doctorSaid.length ? visit.recap.doctorSaid : fromNotes;
  const source = visit.recap?.doctorSaid.length ? visit.recap.source : fromNotes.length ? 'notes' : undefined;
  const covered = visit.covered ?? [];

  const startEdit = () => { setDraft(points.join('\n')); setEditing(true); };
  const save = () => {
    if (hasCrisisLanguage(draft)) { navigate('/help/now'); return; }
    const doctorSaid = draft.split('\n').map((l) => l.trim()).filter(Boolean);
    updateVisit(visit.id, { recap: { doctorSaid, source: visit.recap?.source ?? 'notes', updatedAt: new Date().toISOString() } });
    setEditing(false);
  };
  const share = async () => {
    const text = [`Visit recap · ${formatShort(visit.date)}`, '', 'What the doctor said:', ...points.map((p) => `• ${p}`), '', 'My talking points:',
      ...visit.priorities.map((p) => `${covered.includes(p) ? '✓' : '○'} ${p}`)].join('\n');
    showToast(await shareText('Visit recap', text));
  };

  return (
    <VisitLayout visit={visit} stage="after" step="">
      <section className="panel panel--accent">
        <div className="row row--between row--wrap">
          <h1 className="panel-title">What happened at your visit</h1>
          {source && <span className="pill pill--amber-soft">{source === 'recording' ? '★ From your recording' : source === 'transcript' ? '★ From your transcript' : 'From your notes'}</span>}
        </div>
        {editing ? (
          <div className="field">
            <label htmlFor="said">What the doctor said — one point per line, in plain words</label>
            <textarea id="said" className="textarea" style={{ minHeight: 150 }} value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={'Your low mood is being taken seriously.\nReferral to a therapist will be sent.'} />
          </div>
        ) : (
          <div className="two-col two-col--plain">
            <div>
              <span className="eyebrow-soft">What the doctor said</span>
              {points.length ? (
                <ul className="list">{points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              ) : (
                <p className="muted">Nothing yet. Type the key points you remember — a few words each is fine.</p>
              )}
            </div>
            <div>
              <span className="eyebrow-soft">Your talking points</span>
              {visit.priorities.length ? (
                <ul className="ticks">
                  {visit.priorities.map((p) => (
                    <li key={p} className={covered.includes(p) ? 'on' : ''}><span aria-hidden="true">{covered.includes(p) ? '✓' : '○'}</span> {p}{!covered.includes(p) && <span className="sr-only"> (not covered)</span>}</li>
                  ))}
                </ul>
              ) : <p className="muted">No talking points were set.</p>}
            </div>
          </div>
        )}
        <p className="note">Plain words, about a 6th-grade reading level. Check anything unclear with your doctor.</p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          {editing ? (
            <>
              <button className="btn btn--outline" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={save}>Save recap</button>
            </>
          ) : (
            <>
              <button className="btn btn--outline" onClick={startEdit}>{points.length ? 'Fix something' : 'Type key points'}</button>
              <button className="btn btn--outline" onClick={share} disabled={!points.length}>Share</button>
              <Link to={`/visits/${visit.id}/after/check-in`} className="btn btn--primary">Next: check-in</Link>
            </>
          )}
        </div>
      </section>
      {toast}
    </VisitLayout>
  );
}

/* ======================================================================
   F2 · Post-visit check-in (north-star KPIs)
   ====================================================================== */

export function CheckInStep() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const submit = useApp((s) => s.submitCheckIn);
  const [heard, setHeard] = useState<number | undefined>(visit?.checkIn?.feltHeard);
  const [agreed, setAgreed] = useState<CheckIn['nextStepAgreed']>(visit?.checkIn?.nextStepAgreed);
  const [helped, setHelped] = useState<Answer3 | undefined>(visit?.checkIn?.playbookHelped);
  if (!visit) return <Navigate to="/visits" replace />;

  const save = () => {
    submit(visit.id, { ...visit.checkIn, feltHeard: heard!, nextStepAgreed: agreed, playbookHelped: helped });
    navigate(`/visits/${visit.id}/after/next-steps`);
  };

  return (
    <VisitLayout visit={visit} stage="after" step="check-in">
      <h1>How did it go?</h1>
      <p className="muted" style={{ marginTop: -6 }}>30 seconds. It helps you follow up and helps people like you.</p>
      <section className="panel">
        <span className="eyebrow-soft">Did you feel heard?</span>
        <div className="scale scale--wide" role="group" aria-label="Felt heard, 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={heard === n} onClick={() => setHeard(n)}>{n}</button>)}
        </div>
        <div className="row row--between small muted"><span>Not at all</span><span>Completely</span></div>
      </section>
      <div className="two-col">
        <section className="panel">
          <span className="eyebrow-soft">Was a next step agreed?</span>
          <ChipSelect label="Was a next step agreed" options={['Yes', 'Not clear', 'No']} value={agreed} onChange={(v) => setAgreed(v as CheckIn['nextStepAgreed'])} />
        </section>
        <section className="panel">
          <span className="eyebrow-soft">Did a playbook help?</span>
          <ChipSelect label="Did a playbook help" options={['Yes', 'A little', 'No']} value={helped} onChange={(v) => setHelped(v as Answer3)} />
        </section>
      </div>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn--primary" disabled={!heard || !agreed} onClick={save}>Save</button>
      </div>
    </VisitLayout>
  );
}

/* ======================================================================
   F3 · Next steps + reminders + share what helped
   ====================================================================== */

const STEP_IDEAS = ['Therapist referral', 'Start new medicine', 'Change dose', 'Blood test', 'Follow-up visit'];

function dueLabel(f: FollowUp) {
  const d = daysUntil(f.dueDate);
  if (d === 0) return 'today';
  if (d < 0) return `was due ${formatShort(f.dueDate)}`;
  if (f.isVisit && d >= 14) return `in ${Math.round(d / 7)} weeks`;
  return `by ${formatShort(f.dueDate)}`;
}

export function NextStepsStep() {
  const visit = useVisitParam();
  useAfterVisitSummary(visit);
  const navigate = useNavigate();
  const state = useApp();
  const [what, setWhat] = useState('');
  const [who, setWho] = useState('You');
  const [due, setDue] = useState(addDays(todayISO(), 14));
  const [tip, setTip] = useState('');
  const [toast, showToast] = useToast();
  if (!visit) return <Navigate to="/visits" replace />;

  const steps = state.followUps.filter((f) => f.visitId === visit.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const open = steps.filter((f) => !f.outcome);
  const watch = open.find((f) => f.owner && f.owner !== 'You' && !f.isVisit);
  const notAgreed = visit.checkIn && visit.checkIn.nextStepAgreed !== 'Yes';
  const helpedScript = SCRIPTS.find((s) => s.id === (visit.scripts?.[0] ?? state.savedScripts[0]));
  const helped = visit.checkIn?.playbookHelped;
  const anon = !!state.profile?.consent?.anonymousRatings;

  const add = () => {
    const t = what.trim();
    if (!t) return;
    if (hasCrisisLanguage(t, who)) { navigate('/help/now'); return; }
    state.addFollowUp({ visitId: visit.id, step: t, owner: who.trim() || 'You', dueDate: due, reminder: false, isVisit: /visit|appointment/i.test(t) });
    setWhat('');
  };
  const shareTip = () => {
    if (hasCrisisLanguage(tip)) { navigate('/help/now'); return; }
    state.addTip({ text: tip.trim(), rating: helped, scriptId: helpedScript?.id });
    setTip('');
    showToast(anon ? 'Thank you — saved to share anonymously' : 'Thank you — saved on this device');
  };

  return (
    <VisitLayout visit={visit} stage="after" step="next-steps">
      <div className="f3-grid">
        <section className="panel">
          <span className="eyebrow-soft">Next steps</span>
          {notAgreed && (
            <div className="note">
              No clear next step? You can still ask. <Link to="/escalation">See what to say</Link>
            </div>
          )}
          {steps.length === 0 && <p className="muted" style={{ margin: 0 }}>Add what was promised, who does it, and by when.</p>}
          <ul className="found">
            {steps.map((f) => (
              <li key={f.id}>
                <span style={{ flex: 1 }}>
                  <strong>{f.step}</strong> · {f.owner ?? 'You'} · {dueLabel(f)}
                  {f.outcome && <span className="small muted"> · {f.outcome.toLowerCase()}</span>}
                </span>
                {f.outcome ? null : f.isVisit ? (
                  <Link className="btn btn--outline btn--sm" to={`/visits/new?date=${f.dueDate}${visit.clinician ? `&with=${encodeURIComponent(visit.clinician)}` : ''}`}>Add visit</Link>
                ) : f.reminder !== false ? (
                  <button className="tag tag--btn" onClick={() => state.updateFollowUp(f.id, { reminder: false })} aria-label={`Reminder set for ${f.step}. Tap to turn off.`}>Reminder set</button>
                ) : (
                  <button className="btn btn--outline btn--sm" onClick={() => state.updateFollowUp(f.id, { reminder: true })}>Remind me</button>
                )}
              </li>
            ))}
          </ul>
          <form className="add-step" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <div className="field">
              <label htmlFor="what">Add a next step</label>
              <input id="what" className="input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Therapist referral" />
              <div className="chips">{STEP_IDEAS.map((s) => <Chip key={s} selected={what === s} onClick={() => setWhat(s)}>{s}</Chip>)}</div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="who">Who does it?</label>
                <input id="who" className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="You, the clinic…" />
              </div>
              <div className="field">
                <label htmlFor="by">By when?</label>
                <input id="by" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
            <button className="btn btn--outline btn--sm" type="submit" disabled={!what.trim()} style={{ alignSelf: 'flex-start' }}>Add step</button>
          </form>
          {watch && <div className="note">If the {watch.step.toLowerCase()} hasn’t come by {formatShort(watch.dueDate)}, we’ll help you follow up.</div>}
        </section>

        <section className="panel">
          <span className="eyebrow-soft">Share what helped</span>
          <p style={{ margin: 0 }}>
            {helpedScript && (helped === 'Yes' || helped === 'A little')
              ? `“${helpedScript.situation.replace(/^If you hear /, '').replace(/^“|”$/g, '')}” helped you. Want to help others?`
              : 'Your tip can help the next person walk in prepared.'}
          </p>
          <div className="field">
            <label htmlFor="tip">Add a tip <span className="muted">(optional)</span></label>
            <textarea id="tip" className="textarea" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="e.g., asking them to note it in my chart changed the conversation" />
          </div>
          <button className="btn btn--primary btn--block" disabled={!tip.trim() && !helped} onClick={shareTip}>Share anonymously</button>
          <p className="small muted" style={{ margin: 0 }}>
            Leave out names and places. {anon ? 'Shared without your name once sharing is live.' : 'Anonymous sharing is off, so this stays on your device. Turn it on in Settings → Privacy.'}
          </p>
        </section>
      </div>
      {toast}
    </VisitLayout>
  );
}
