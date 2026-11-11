/**
 * Drop-in "In the room" transcript import. Self-contained, so the design can put it anywhere
 * (e.g. the Recap step) with one line:
 *
 *   <TranscriptImport patientName={profile?.name} demo={demoMode} onUse={(lines) => saveToRecap(lines)} />
 *
 * Paste or upload (.txt) → crisis check on the device → POST /api/visit-summary → the clinician's lines,
 * reviewed by the patient → onUse(lines). Nothing else is kept: the raw transcript lives only in this
 * component's memory (ADR-001 Decision 5) and is gone when it unmounts.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEO_SAMPLE_TRANSCRIPT } from '../../data/sampleTranscript';
import { requestVisitSummary } from '../../lib/api';
import { hasCrisisLanguage } from '../../lib/safety';
import { MAX_TRANSCRIPT_CHARS, MAX_UPLOAD_BYTES, SYNTHETIC_LABEL } from '../../lib/transcript/constants';
import { decodeTranscriptFile, intakeError } from '../../lib/transcript/intake';
import type { TranscriptSource } from '../../lib/transcript/types';

export interface TranscriptImportProps {
  /** The patient's first name, so their own lines aren't mistaken for the clinician's. */
  patientName?: string;
  /** Show "Use Theo's sample transcript" (demo mode only). */
  demo?: boolean;
  /** Called with the reviewed "What the doctor said" lines when the patient taps "Use these lines". */
  onUse: (doctorSaid: string[], meta: { clinicians: string[] }) => void;
  onCancel?: () => void;
}

type Result = { doctorSaid: string[]; clinicians: string[]; dialogueTurns: number };

export function TranscriptImport({ patientName, demo = false, onUse, onCancel }: TranscriptImportProps) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState<{ text: string; source: TranscriptSource } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);

  const source: TranscriptSource = loaded && loaded.text === text ? loaded.source : 'paste';

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return setError(intakeError('FILE_TOO_LARGE').message);
    const decoded = decodeTranscriptFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (!decoded.ok) return setError(decoded.error.message);
    setError(null);
    setText(decoded.value);
    setLoaded({ text: decoded.value, source: 'upload' });
  };

  const toCrisisSupport = () => {
    setText('');
    setLoaded(null);
    navigate('/help/now');
  };

  const onContinue = async () => {
    if (busy) return;
    // Checked on the device first, so crisis text is never sent. The server checks again.
    if (hasCrisisLanguage(text)) return toCrisisSupport();
    setBusy(true);
    setError(null);
    const out = await requestVisitSummary(text, source, { patientName });
    setBusy(false);
    if (out.status === 'crisis') return toCrisisSupport();
    if (out.status === 'rejected') return setError(out.error.message);
    if (out.status === 'unavailable') return setError(out.message);
    setResult(out);
  };

  if (result) {
    return (
      <section className="panel panel--accent" aria-labelledby="ti-result">
        <span className="eyebrow-soft">From the transcript · {result.clinicians.join(', ') || 'clinician not found'}</span>
        <h2 id="ti-result" ref={resultRef} tabIndex={-1} className="panel-title">What the doctor said</h2>
        {result.doctorSaid.length ? (
          <ul className="list">{result.doctorSaid.map((l, i) => <li key={i}>{l}</li>)}</ul>
        ) : (
          <p className="muted">We couldn’t tell which lines were the clinician’s. Try one line per person, like “Dr. Lane: …”.</p>
        )}
        <p className="note">{SYNTHETIC_LABEL} These are the clinician’s own words from the transcript. Check anything unclear with your doctor.</p>
        <div className="btn-row">
          <button className="btn btn--outline" onClick={() => setResult(null)}>Back to the transcript</button>
          <button className="btn btn--primary" disabled={!result.doctorSaid.length} onClick={() => onUse(result.doctorSaid, { clinicians: result.clinicians })}>
            Use these lines
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="ti-title">
      <span className="eyebrow-soft">In the room</span>
      <h2 id="ti-title" className="panel-title">Add a transcript of your visit</h2>
      <p className="muted" style={{ margin: 0 }}>
        Paste the conversation or upload a .txt file. We pull out what the doctor said for your recap.
        The transcript itself isn’t saved.
      </p>

      {demo && (
        <button type="button" className="btn btn--outline" style={{ alignSelf: 'flex-start' }}
          onClick={() => { setError(null); setText(THEO_SAMPLE_TRANSCRIPT); setLoaded({ text: THEO_SAMPLE_TRANSCRIPT, source: 'sample' }); }}>
          Use Theo’s sample transcript
        </button>
      )}

      <label htmlFor="ti-text" className="sr-only">Transcript</label>
      <textarea id="ti-text" className="textarea" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'One line per person works best, e.g.\nDr. Lane: Let’s give it time.\nTheo: It started with the new dose.'}
        aria-describedby={error ? 'ti-hint ti-error' : 'ti-hint'} aria-invalid={error ? true : undefined} spellCheck={false} />
      <span id="ti-hint" className="small muted">Up to {MAX_TRANSCRIPT_CHARS.toLocaleString('en-US')} characters, or a .txt file up to {Math.round(MAX_UPLOAD_BYTES / 1024)} KB.</span>

      <div className="field">
        <label htmlFor="ti-file" className="small">Or upload a .txt file</label>
        <input id="ti-file" type="file" accept=".txt,text/plain" onChange={onFile} />
      </div>

      {error && <div id="ti-error" ref={errorRef} tabIndex={-1} role="alert" className="pcard pcard--muted">{error}</div>}

      <div className="btn-row">
        {onCancel && <button className="btn btn--outline" onClick={onCancel}>Cancel</button>}
        <button className="btn btn--primary" onClick={() => void onContinue()} disabled={busy || !text.trim()} aria-busy={busy}>
          {busy ? 'Reading…' : 'Continue'}
        </button>
      </div>
    </section>
  );
}
