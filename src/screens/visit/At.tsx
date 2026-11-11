import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getRecognition, type SpeechRecognitionLike } from '../../components/TalkOrType';
import { Checkbox } from '../../components/ui';
import { SCRIPTS } from '../../data/scripts';
import { APP_NAME } from '../../lib/brand';
import { buildBriefSnapshot } from '../../lib/brief';
import { hasCrisisLanguage } from '../../lib/safety';
import { useApp } from '../../lib/store';
import { DoctorBriefBody } from '../Brief';
import { Modal, useVisitParam, VisitLayout } from './common';

/* ======================================================================
   A2 + A3 · Consent to capture, then real-time support + playbook
   ====================================================================== */

export function AtVisit() {
  const visit = useVisitParam();
  const updateVisit = useApp((s) => s.updateVisit);
  const savedScripts = useApp((s) => s.savedScripts);
  const [iAgree, setIAgree] = useState(false);
  const [docAgrees, setDocAgrees] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [scriptId, setScriptId] = useState<string>();
  if (!visit) return <Navigate to="/visits" replace />;

  const decided = !!visit.recording;
  const scripts = [...new Set([...(visit.scripts ?? []), ...savedScripts])];
  const shown = SCRIPTS.find((s) => s.id === (scriptId ?? scripts[0])) ?? SCRIPTS[0];
  const covered = visit.covered ?? [];
  const nextUp = visit.priorities.find((p) => !covered.includes(p));
  const notesCrisis = hasCrisisLanguage(visit.notes);

  const start = () => {
    updateVisit(visit.id, { recording: 'agreed' });
    setCapturing(true);
  };

  return (
    <VisitLayout visit={visit} stage="at">
      <div className="a3-grid">
        <div className="stack">
          {visit.recording === 'agreed' && (
            <CaptureBar
              running={capturing}
              setRunning={setCapturing}
              onStop={(sentences) => {
                if (!sentences.length) return;
                const prev = useApp.getState().visits.find((v) => v.id === visit.id)?.recap?.doctorSaid ?? [];
                updateVisit(visit.id, { recap: { doctorSaid: [...prev, ...sentences], source: 'recording', updatedAt: new Date().toISOString() } });
              }}
            />
          )}

          <div className="btn-row">
            <Link to={`/visits/${visit.id}/at/room`} className="btn btn--primary">Show in the room</Link>
            {visit.recording === 'declined' && (
              <button className="link-btn" onClick={() => updateVisit(visit.id, { recording: undefined })}>Record after all?</button>
            )}
          </div>

          <section className="panel panel--accent">
            <span className="eyebrow-soft">Your talking points · tick as you cover them</span>
            {visit.priorities.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No talking points yet. <Link to={`/visits/${visit.id}/before/brief`}>Add your top 3</Link>.</p>
            ) : (
              <div className="checklist">
                {visit.priorities.map((p) => (
                  <div key={p} className="checklist__row">
                    <Checkbox checked={covered.includes(p)} onChange={(on) => updateVisit(visit.id, { covered: on ? [...covered, p] : covered.filter((c) => c !== p) })}>{p}</Checkbox>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <label htmlFor="qn" className="eyebrow-soft">Quick notes</label>
            <textarea id="qn" className="textarea" style={{ minHeight: 90 }} value={visit.notes ?? ''}
              onChange={(e) => updateVisit(visit.id, { notes: e.target.value })}
              placeholder="Jot what the doctor says — it feeds your recap." />
            {notesCrisis && (
              <div className="pcard pcard--crisis" role="alert" style={{ padding: 14 }}>
                <span className="small"><strong>If you need support right now,</strong> you can call or text 988 any time.</span>
                <Link to="/help-now" className="btn btn--sm btn--danger" style={{ alignSelf: 'flex-start' }}>Get help now</Link>
              </div>
            )}
          </section>

          {nextUp && (
            <section className="panel panel--muted" aria-live="polite">
              <span className="eyebrow-soft">Quiet tip</span>
              <p style={{ margin: 0 }}>You haven’t covered “{nextUp}” yet. Try: “Before we finish, can we talk about {nextUp.charAt(0).toLowerCase() + nextUp.slice(1)}?”</p>
            </section>
          )}
          <Link to={`/visits/${visit.id}/after`} className="btn btn--block btn--outline">Visit’s over — go to recap</Link>
        </div>

        <aside className="panel playbook-now" aria-labelledby="pb-now">
          <span className="eyebrow-soft">Playbook · open now</span>
          <h2 id="pb-now" className="panel-title">{shown.situation}</h2>
          <div className="bubble">“{shown.text}”</div>
          <div className="bubble">“What would we try next if this doesn’t improve in [4] weeks?”</div>
          {scripts.length > 1 && (
            <div className="field">
              <label htmlFor="pick" className="small muted">Switch playbook</label>
              <select id="pick" className="select input" value={shown.id} onChange={(e) => setScriptId(e.target.value)}>
                {scripts.map((id) => { const s = SCRIPTS.find((x) => x.id === id); return s ? <option key={id} value={id}>{s.situation}</option> : null; })}
              </select>
            </div>
          )}
          <Link to="/playbooks" className="link-btn" style={{ alignSelf: 'flex-start' }}>Other playbooks</Link>
        </aside>
      </div>

      {!decided && (
        <Modal title="Record this visit for your recap?" onClose={() => updateVisit(visit.id, { recording: 'declined' })}>
          <p className="muted" style={{ margin: 0 }}>We’ll turn the conversation into a plain recap for you. Recording only starts when both of you agree.</p>
          <div className="checklist">
            <div className="checklist__row"><Checkbox checked={iAgree} onChange={setIAgree}><strong>I agree</strong> to record this visit</Checkbox></div>
            <div className="checklist__row"><Checkbox checked={docAgrees} onChange={setDocAgrees}><strong>My doctor agrees</strong> (ask them, then tick)</Checkbox></div>
          </div>
          <p className="note">Ask: “Is it OK if I record this so I remember what we discuss?” You can stop anytime. No audio is kept — only the words, turned into your recap.</p>
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
            <button className="link-btn" onClick={() => updateVisit(visit.id, { recording: 'declined' })}>Don’t record</button>
            <button className="btn btn--primary" disabled={!iAgree || !docAgrees} onClick={start}>Start recording</button>
          </div>
        </Modal>
      )}
    </VisitLayout>
  );
}

/**
 * Live capture with the browser's speech recognition. No audio is stored by us;
 * finished sentences go to the recap when you press Stop.
 */
function CaptureBar({ running, setRunning, onStop }: { running: boolean; setRunning: (v: boolean) => void; onStop: (sentences: string[]) => void }) {
  const Ctor = getRecognition();
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(!running);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const textRef = useRef('');
  const finalRef = useRef('');

  useEffect(() => {
    if (!running || paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running, paused]);

  useEffect(() => {
    if (!running || paused || !Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + '. ';
      textRef.current = t;
    };
    let active = true;
    rec.onend = () => {
      finalRef.current += textRef.current;
      textRef.current = '';
      // Browsers end recognition after a silence; keep listening while recording.
      if (active) { try { rec.start(); } catch { /* ignore */ } }
    };
    rec.onerror = () => undefined;
    recRef.current = rec;
    try { rec.start(); } catch { /* mic blocked */ }
    return () => { active = false; rec.stop(); };
  }, [running, paused, Ctor]);

  const stop = () => {
    recRef.current?.stop();
    setRunning(false);
    setStopped(true);
    const all = (finalRef.current + textRef.current).split(/(?<=[.?!])\s+/).map((s) => s.replace(/\.\s*$/, '').trim()).filter((s) => s.length > 3);
    finalRef.current = '';
    textRef.current = '';
    onStop(all.map((s) => s.charAt(0).toUpperCase() + s.slice(1) + '.'));
  };

  const mm = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (stopped) {
    return (
      <div className="rec-bar rec-bar--off">
        <span><strong>Recording stopped</strong>{seconds ? ` · ${mm}` : ''}. Your recap is ready to check after the visit.</span>
        <button className="btn btn--outline btn--sm" onClick={() => { setStopped(false); setPaused(false); setRunning(true); }}>Record again</button>
      </div>
    );
  }
  return (
    <div className="rec-bar" role="status">
      <span className={`rec-dot${paused ? ' rec-dot--paused' : ''}`} aria-hidden="true" />
      <span style={{ flex: 1 }}>
        <strong>{paused ? 'Paused' : 'Recording'}</strong> · {mm} · both agreed
        {!Ctor && <span className="small muted" style={{ display: 'block' }}>Live capture isn’t available in this browser. Your quick notes will feed the recap.</span>}
      </span>
      <button className="btn btn--outline btn--sm" onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
      <button className="btn btn--danger btn--sm" onClick={stop}>Stop</button>
    </div>
  );
}

/* ======================================================================
   A1 · Show in the room — full screen, no app chrome, adjustable text
   ====================================================================== */

export function ShowInRoom() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const state = useApp();
  const [params] = useSearchParams();
  const [scale, setScale] = useState(1.1);
  const printMode = params.get('print') === '1';

  useEffect(() => {
    if (!printMode) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [printMode]);

  if (!visit) return <Navigate to="/visits" replace />;
  const include = { talkingPoints: params.get('tp') !== '0', summary: params.get('sum') !== '0' };
  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    navigate(printMode ? `/visits/${visit.id}/before/share` : `/visits/${visit.id}/at`);
  };

  return (
    <div className="room-page" style={{ fontSize: `${scale}rem` }}>
      <header className="room-head no-print">
        <button className="link-btn" onClick={exit}>× Exit full screen</button>
        <span className="room-head__title">For your doctor</span>
        <div className="row">
          <button className="btn btn--outline btn--sm" aria-label="Smaller text" onClick={() => setScale((s) => Math.max(0.9, +(s - 0.15).toFixed(2)))}>A−</button>
          <button className="btn btn--outline btn--sm" aria-label="Larger text" onClick={() => setScale((s) => Math.min(1.9, +(s + 0.15).toFixed(2)))}>A+</button>
        </div>
      </header>
      <main id="main" className="room-main">
        <DoctorBriefBody data={buildBriefSnapshot(state, visit, include)} />
        <p className="small muted">Prepared by the patient with {APP_NAME}. Patient-reported.</p>
      </main>
    </div>
  );
}
