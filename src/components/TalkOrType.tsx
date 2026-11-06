import { useEffect, useRef, useState } from 'react';

/* Minimal typing for the Web Speech API (not in TS DOM lib). */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SpeechRecognitionLike;

function getRecognition(): SRCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}

/**
 * "Hold to talk" or type. Uses the browser's speech recognition where available
 * (Chrome, Safari). Audio is handled by the browser vendor and never stored by us.
 * Where it isn't supported, only the text box shows.
 */
export function TalkOrType({ value, onChange, placeholder, label = 'Or type it' }: Props) {
  const Ctor = getRecognition();
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef('');

  useEffect(() => () => recRef.current?.stop(), []);

  const start = () => {
    if (!Ctor || listening) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = value ? value.trimEnd() + ' ' : '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onChange(baseRef.current + text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };
  const stop = () => recRef.current?.stop();

  return (
    <div className="stack">
      {Ctor && (
        <div className="stack-sm" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className={`talk${listening ? ' listening' : ''}`}
            onPointerDown={(e) => { e.preventDefault(); start(); }}
            onPointerUp={stop}
            onPointerLeave={stop}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); listening ? stop() : start(); } }}
            aria-pressed={listening}
          >
            {listening ? 'Listening' : 'Talk'}
          </button>
          <span className="small muted">{listening ? 'Release to stop' : 'Hold to talk'}</span>
        </div>
      )}
      <div className="field">
        <label className="muted">{Ctor ? label : 'Type it'}</label>
        <textarea className="textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
