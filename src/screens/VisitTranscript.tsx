import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useToast } from '../components/ui';
import { THEO_SAMPLE_TRANSCRIPT } from '../data/sampleTranscript';
import { formatDate } from '../lib/dates';
import { useApp } from '../lib/store';
import { MAX_TRANSCRIPT_CHARS, MAX_UPLOAD_BYTES } from '../lib/transcript/constants';
import { decodeTranscriptFile, intakeError, processTranscript } from '../lib/transcript/intake';
import type { IntakeError, TranscriptPayload, TranscriptSource } from '../lib/transcript/types';

/**
 * "In the room" step: the patient pastes or uploads what was said during a visit, checks it,
 * and saves it to that visit. Nothing is kept until they choose "Save to this visit".
 */
export function VisitTranscript() {
  const { id } = useParams();
  const navigate = useNavigate();
  const visit = useApp((s) => s.visits.find((v) => v.id === id));
  const demo = useApp((s) => s.demoMode);
  const you = useApp((s) => s.profile?.name);
  const save = useApp((s) => s.saveVisitTranscript);
  const [toast, showToast] = useToast();

  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState<{ text: string; source: TranscriptSource } | null>(null);
  const [error, setError] = useState<IntakeError | null>(null);
  const [review, setReview] = useState<TranscriptPayload | null>(null);
  const [replacing, setReplacing] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to what changed so keyboard and screen-reader users land on it.
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { headingRef.current?.focus(); }, [review, replacing]);

  if (!visit) return <Navigate to="/visits" replace />;

  const visitLabel = `${formatDate(visit.date)}${visit.clinician ? ` with ${visit.clinician}` : ''}`;
  const header = { kind: 'sub' as const, title: 'In the room', back: '/visits', backLabel: 'Visits', right: <span /> };
  // Text loaded from a file or the sample keeps that source until the person edits it.
  const source: TranscriptSource = loaded && loaded.text === text ? loaded.source : 'paste';

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return setError(intakeError('FILE_TOO_LARGE'));
    const decoded = decodeTranscriptFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (!decoded.ok) return setError(decoded.error);
    setError(null);
    setText(decoded.value);
    setLoaded({ text: decoded.value, source: 'upload' });
  };

  const loadSample = () => {
    setError(null);
    setText(THEO_SAMPLE_TRANSCRIPT);
    setLoaded({ text: THEO_SAMPLE_TRANSCRIPT, source: 'sample' });
  };

  const onContinue = () => {
    const outcome = processTranscript(text, source);
    if (outcome.status === 'crisis') {
      // Never keep flagged text: clear it and go straight to support.
      setText('');
      setLoaded(null);
      navigate('/help/now', { replace: true });
      return;
    }
    if (outcome.status === 'rejected') return setError(outcome.error);
    setError(null);
    setReview(outcome.payload);
  };

  const onSave = () => {
    if (!review) return;
    save(visit.id, review);
    setReview(null);
    setReplacing(false);
    setText('');
    setLoaded(null);
    showToast('Saved to this visit');
  };

  // ----- Review before saving -----
  if (review) {
    return (
      <Shell header={header}>
        <h1 ref={headingRef} tabIndex={-1}>Check it’s right</h1>
        <p className="lead">This is what we’ll keep with your visit on {visitLabel}. Nothing is saved until you choose “Save to this visit”.</p>
        <TranscriptView payload={review} you={you} />
        <button className="btn btn--primary btn--block" onClick={onSave}>Save to this visit</button>
        <button className="btn btn--block" onClick={() => setReview(null)}>Go back and edit</button>
      </Shell>
    );
  }

  // ----- Already saved -----
  if (visit.transcript && !replacing) {
    return (
      <Shell header={header}>
        {toast}
        <span className="badge">Saved to this visit</span>
        <h1 ref={headingRef} tabIndex={-1}>What was said in the room</h1>
        <p className="small muted">Visit on {visitLabel}</p>
        <TranscriptView payload={visit.transcript} you={you} />
        <section className="card card--muted">
          <span className="card__label">Coming next</span>
          <p>We’ll turn this into an after-visit summary and action items for your case.</p>
        </section>
        <button className="btn btn--block" onClick={() => setReplacing(true)}>Replace transcript</button>
      </Shell>
    );
  }

  // ----- Paste or upload -----
  return (
    <Shell header={header}>
      <h1 ref={headingRef} tabIndex={-1}>What was said in the room?</h1>
      <p className="lead">Paste the conversation from your visit on {visitLabel}, or upload it as a text file. We’ll keep it with this visit so you can build your case.</p>

      {demo && (
        <section className="card card--soft">
          <span className="card__label">Demo</span>
          <p>Use Theo’s appointment transcript with Dr. Lane from the synthetic starter pack.</p>
          <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={loadSample}>
            Use Theo’s sample transcript
          </button>
        </section>
      )}

      <div className="field">
        <label htmlFor="transcript">Paste the conversation</label>
        <span id="transcript-hint" className="small muted">
          One line per person works best, like “Dr. Lane: …”. Up to {MAX_TRANSCRIPT_CHARS.toLocaleString('en-US')} characters.
        </span>
        <textarea
          id="transcript"
          className="textarea"
          style={{ minHeight: 220 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={error ? 'transcript-hint transcript-error' : 'transcript-hint'}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
        />
        <span className="small muted">{text.length.toLocaleString('en-US')} characters</span>
      </div>

      <div className="field">
        <label htmlFor="transcript-file">Or upload a .txt file</label>
        <input id="transcript-file" type="file" accept=".txt,text/plain" onChange={onFile} aria-describedby="file-hint" />
        <span id="file-hint" className="small muted">Plain text only, up to {Math.round(MAX_UPLOAD_BYTES / 1024)} KB. The text appears above so you can check it.</span>
      </div>

      {error && (
        <div id="transcript-error" ref={errorRef} tabIndex={-1} role="alert" className="card card--danger">
          {error.message}
        </div>
      )}

      <button className="btn btn--primary btn--block" onClick={onContinue}>Continue</button>
      {replacing && <button className="btn btn--block" onClick={() => setReplacing(false)}>Keep the saved one</button>}
    </Shell>
  );
}

/** Read-only view of a transcript payload. Rendered as text (React escapes it), never as HTML. */
function TranscriptView({ payload, you }: { payload: TranscriptPayload; you?: string }) {
  return (
    <section className="card" aria-label="Transcript">
      <span className="badge badge--muted" style={{ alignSelf: 'flex-start' }}>{payload.disclaimer}</span>
      <p className="small muted">
        {payload.stats.dialogueTurns} lines of conversation
        {payload.speakers.length > 0 && ` · ${payload.speakers.join(', ')}`} · {payload.stats.words.toLocaleString('en-US')} words
      </p>
      <ol className="turns">
        {payload.turns.map((t, i) =>
          t.speaker ? (
            <li key={i} className={`turn${t.speaker === you ? ' turn--you' : ''}`}>
              <span className="turn__speaker">{t.speaker === you ? `${t.speaker} (you)` : t.speaker}</span>
              <span>{t.text}</span>
            </li>
          ) : (
            <li key={i} className="turn turn--note small muted">{t.text}</li>
          ),
        )}
      </ol>
      <details className="small">
        <summary>Show the data (JSON)</summary>
        <pre className="json" tabIndex={0}>{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </section>
  );
}
