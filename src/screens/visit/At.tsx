import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getRecognition } from '../../components/TalkOrType';
import { Checkbox } from '../../components/ui';
import { SCRIPTS } from '../../data/scripts';
import { APP_NAME } from '../../lib/brand';
import { buildBriefSnapshot } from '../../lib/brief';
import { fitToOnePage } from '../../lib/onePageBrief';
import { hasCrisisLanguage } from '../../lib/safety';
import { useApp } from '../../lib/store';
import { useLiveTranscript } from '../../lib/transcript/useLiveTranscript';
import { matchesVisitNotes, matchesVisitRecording, VISIT_SAID } from '../../lib/walkthrough';
import { detectCues } from '../../lib/cues/cues';
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
  const [dismissedCues, setDismissedCues] = useState<string[]>([]);
  const evidence = useApp((s) => s.evidence);
  const visits = useApp((s) => s.visits);
  if (!visit) return <Navigate to="/visits" replace />;

  const decided = !!visit.recording;
  const scripts = [...new Set([...(visit.scripts ?? []), ...savedScripts])];
  const shown = SCRIPTS.find((s) => s.id === (scriptId ?? scripts[0])) ?? SCRIPTS[0];
  const covered = visit.covered ?? [];
  const nextUp = visit.priorities.find((p) => !covered.includes(p));
  // Crisis words typed in quick notes OR heard while recording (ADR-021) show the 988 support right away.
  const notesCrisis = hasCrisisLanguage(visit.notes, ...(visit.live?.segments ?? []));
  // Be-believed cues (ADR-022): playbook lines for dismissing moments heard live or typed in quick notes.
  const medChange = evidence.filter((e) => e.type === 'medication').sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const lastVisit = visits.filter((v) => v.id !== visit.id && v.date < visit.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const heard = detectCues([...(visit.live?.segments ?? []), ...(visit.notes ?? '').split(/\n+/)], {
    priorities: visit.priorities,
    covered,
    latestMedChange: medChange && { label: medChange.detail, date: medChange.date },
    lastVisitDate: lastVisit?.date,
    dismissed: dismissedCues,
  });

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
              visitId={visit.id}
              running={capturing}
              setRunning={setCapturing}
              onStop={(sentences) => {
                if (!sentences.length) return;
                const prev = useApp.getState().visits.find((v) => v.id === visit.id)?.recap?.doctorSaid ?? [];
                updateVisit(visit.id, { recap: { doctorSaid: [...prev, ...sentences], source: 'recording', updatedAt: new Date().toISOString() } });
              }}
            />
          )}

          {visit.recording === 'declined' && (
            <div className="btn-row">
              <button className="link-btn" onClick={() => updateVisit(visit.id, { recording: undefined })}>Record after all?</button>
            </div>
          )}

          <section className="panel">
            <label htmlFor="qn" className="eyebrow-soft">Quick notes</label>
            <textarea id="qn" className="textarea" style={{ minHeight: 90 }} value={visit.notes ?? ''}
              onChange={(e) => updateVisit(visit.id, { notes: e.target.value })}
              placeholder="Jot what the doctor says — it feeds your visit summary." />
            {notesCrisis && (
              <div className="pcard pcard--crisis" role="alert" style={{ padding: 14 }}>
                <span className="small"><strong>If you need support right now,</strong> you can call or text 988 any time.</span>
                <Link to="/help-now" className="btn btn--sm btn--danger" style={{ alignSelf: 'flex-start' }}>Get help now</Link>
              </div>
            )}
          </section>

          <section className="panel panel--accent">
            <span className="eyebrow-soft">Your appointment talking points · tick as you cover them</span>
            {visit.priorities.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No talking points yet. <Link to={`/visits/${visit.id}/before/brief`}>Add your talking points</Link>.</p>
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

          {/* Be-believed cues (ADR-022): what was heard, and the matching tip line to say. Newest first. */}
          {heard.cues.map((c) => (
            <section key={c.id} className="panel panel--muted" aria-live="polite">
              <span className="eyebrow-soft">Heard: “{c.heard}”</span>
              <p style={{ margin: 0 }}><strong>{c.situation}</strong>. You could say:</p>
              <div className="bubble">“{c.say}”</div>
              <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDismissedCues((d) => [...d, c.id])}>Got it</button>
            </section>
          ))}

          {nextUp && (
            <section className="panel panel--muted" aria-live="polite">
              <span className="eyebrow-soft">Quiet tip</span>
              <p style={{ margin: 0 }}>You haven’t asked about “{nextUp}” yet. Try: “Before we finish, can we talk about {nextUp.charAt(0).toLowerCase() + nextUp.slice(1)}?”</p>
            </section>
          )}
          {/* Same style and place as Continue on the other steps: filled, bottom right. */}
          <div className="b1-footer" style={{ marginTop: 0 }}>
            <span className="spacer" />
            <Link to={`/visits/${visit.id}/after`} className="btn btn--primary" onClick={() => finishWalkthrough(visit.id)}>Visit’s over — go to visit summary</Link>
          </div>
        </div>

        <aside className="panel playbook-now" aria-labelledby="pb-now">
          <span className="eyebrow-soft">What helped others · open now</span>
          <h2 id="pb-now" className="panel-title">{shown.situation}</h2>
          <div className="bubble">“{shown.text}”</div>
          <div className="bubble">“What would we try next if this doesn’t improve in [4] weeks?”</div>
          {scripts.length > 1 && (
            <div className="field">
              <label htmlFor="pick" className="small muted">Switch tip</label>
              <select id="pick" className="select input" value={shown.id} onChange={(e) => setScriptId(e.target.value)}>
                {scripts.map((id) => { const s = SCRIPTS.find((x) => x.id === id); return s ? <option key={id} value={id}>{s.situation}</option> : null; })}
              </select>
            </div>
          )}
          <Link to="/playbooks" className="link-btn" style={{ alignSelf: 'flex-start' }}>Other tips</Link>
        </aside>
      </div>

      {!decided && (
        <Modal title="Record this visit for your visit summary?" onClose={() => updateVisit(visit.id, { recording: 'declined' })}>
          <p className="muted" style={{ margin: 0 }}>By law, we must get permission from everyone involved before we begin recording. We’ll turn the conversation into a plain recap for you. Recording only starts when both of you agree.</p>
          <div className="checklist">
            <div className="checklist__row"><Checkbox checked={iAgree} onChange={setIAgree}><strong>I agree</strong> to record this visit</Checkbox></div>
            <div className="checklist__row"><Checkbox checked={docAgrees} onChange={setDocAgrees}><strong>My doctor agrees</strong> (ask your doctor before you check this)</Checkbox></div>
          </div>
          <p className="note">Ask: “Is it OK if I record this so I remember what we discuss?” You can stop anytime. No audio is kept — only the words, turned into your visit summary.</p>
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
 * Live capture with the browser's speech recognition. No audio is stored by us. Words show live as they're spoken, and
 * each finished piece is saved on the device right away (useLiveTranscript, ADR-021), so nothing is lost if the page
 * closes. Finished sentences go to the recap when you press Stop (or the next time this screen opens).
 */
function CaptureBar({ visitId, running, setRunning, onStop }: { visitId: string; running: boolean; setRunning: (v: boolean) => void; onStop: (sentences: string[]) => void }) {
  const Ctor = getRecognition();
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(!running);
  const [recovered, setRecovered] = useState(0);
  const live = useLiveTranscript(visitId, Ctor, running && !paused && !stopped);

  // Text saved by a recording that never reached Stop (the page closed): put it in the recap now, and say so.
  useEffect(() => {
    if (running) return;
    const sentences = live.leftover();
    if (sentences.length) {
      onStop(sentences);
      setRecovered(sentences.length);
    }
    // Only on first show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running || paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running, paused]);

  const stop = () => {
    setRunning(false);
    setStopped(true);
    // Listening ends when `stopped` turns the hook off; any unfinished words are kept by stop().
    onStop(live.stop());
  };

  const mm = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (stopped) {
    return (
      <div className="rec-bar rec-bar--off">
        <span>
          <strong>Recording stopped</strong>{seconds ? ` · ${mm}` : ''}. Your recap is ready to check after the visit.
          {recovered > 0 && <span className="small muted" style={{ display: 'block' }}>We kept {recovered} sentence{recovered === 1 ? '' : 's'} from before the page closed and added them to your recap.</span>}
        </span>
        <button className="btn btn--outline btn--sm" onClick={() => { setStopped(false); setPaused(false); setRunning(true); setRecovered(0); }}>Record again</button>
      </div>
    );
  }
  return (
    <div className="rec-bar" role="status">
      <span className={`rec-dot${paused ? ' rec-dot--paused' : ''}`} aria-hidden="true" />
      <span style={{ flex: 1 }}>
        <strong>{paused ? 'Paused' : 'Recording'}</strong> · {mm} · both agreed{live.count > 0 && ` · ${live.count} saved`}
        {/* Live words: shown as they're spoken, not read out by screen readers (they change constantly). */}
        {!paused && live.interim && <span className="small muted" aria-live="off" style={{ display: 'block', fontStyle: 'italic' }}>Hearing: “{live.interim}”</span>}
        {!Ctor && <span className="small muted" style={{ display: 'block' }}>Live capture isn’t available in this browser. Your quick notes will feed your visit summary.</span>}
      </span>
      <button className="btn btn--outline btn--sm" onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
      <button className="btn btn--danger btn--sm" onClick={stop}>Stop</button>
    </div>
  );
}

/**
 * Demo walkthrough (lib/walkthrough): when the recorded conversation or the quick notes are the walkthrough's, "Visit's
 * over" fills Visit summary › What was said with its fixed lines, marked "From your recording". Works for a visit dated
 * in the future too (demo only). Unsaved live words are cleared so they aren't added to the recap later.
 */
function finishWalkthrough(visitId: string) {
  const v = useApp.getState().visits.find((x) => x.id === visitId);
  if (!v) return;
  const heard = [...(v.live?.segments ?? []), ...(v.recap?.source === 'recording' ? v.recap.doctorSaid : [])].join(' ');
  if (!matchesVisitRecording(heard) && !matchesVisitNotes(v.notes ?? '')) return;
  useApp.getState().updateVisit(visitId, {
    recap: { doctorSaid: [...VISIT_SAID], source: 'recording', updatedAt: new Date().toISOString() },
    live: undefined,
  });
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
  const include = { talkingPoints: params.get('tp') !== '0', summary: params.get('sum') !== '0', caseHistory: params.get('hist') === '1' };
  // Download PDF: the same one-page rules as shared links (src/lib/onePageBrief.ts); case history prints as page 2.
  const brief = buildBriefSnapshot(state, visit, include);
  const shown = printMode ? fitToOnePage(brief).brief : brief;
  // Back: to wherever they came from (e.g. Visits or Before the visit); Before the visit if opened directly.
  const back = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    if (printMode) return navigate(`/visits/${visit.id}/before/share`);
    if ((window.history.state as { idx?: number } | null)?.idx) return navigate(-1);
    navigate(`/visits/${visit.id}/before`);
  };

  return (
    <div className="room-page" style={{ fontSize: `${scale}rem` }}>
      <header className="room-head no-print">
        <button className="link-btn room-head__back" onClick={back}>← Back</button>
        <span className="room-head__title">For your doctor</span>
        <div className="row">
          <button className="btn btn--outline btn--sm" aria-label="Smaller text" onClick={() => setScale((s) => Math.max(0.9, +(s - 0.15).toFixed(2)))}>A−</button>
          <button className="btn btn--outline btn--sm" aria-label="Larger text" onClick={() => setScale((s) => Math.min(1.9, +(s + 0.15).toFixed(2)))}>A+</button>
        </div>
      </header>
      <main id="main" className="room-main">
        <DoctorBriefBody data={shown} action={printMode ? undefined : (
          <Link to={`/visits/${visit.id}/at/live`} className="btn btn--primary no-print">Record this visit</Link>
        )} />
        <p className="small muted">Prepared by the patient with {APP_NAME}. Patient-reported.</p>
      </main>
    </div>
  );
}
