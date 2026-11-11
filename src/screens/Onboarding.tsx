import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { useSpeechInput } from '../components/TalkOrType';
import { Checkbox, Chip } from '../components/ui';
import { APP_NAME } from '../lib/brand';
import { todayISO } from '../lib/dates';
import { useOnboarding } from '../lib/onboarding';
import { hasCrisisLanguage } from '../lib/safety';
import { selectHasAccount, useApp } from '../lib/store';
import { matchSymptoms, quickTranslate, type QuickLine } from '../lib/translate';
import type { FieldKey, SummaryField } from '../lib/types';

const TOTAL = 5;
const REASONS = ['Low mood', 'Worry or anxiety', 'Trouble sleeping', 'Low energy', 'Side effects from medicine', 'Not sure yet'];
const SPECIALTIES = ['Primary care', 'Psychiatrist', 'Therapist', 'Other'];

/** Onboarding, 5 steps (the "Who is this for?" step was removed). Progress is saved on this device so people can finish later. */
export function Onboarding() {
  const navigate = useNavigate();
  const ob = useOnboarding();
  const complete = useApp((s) => s.completeOnboarding);
  const fromSignup = useLocation().state as { email?: string; firstName?: string; lastName?: string; passwordHash?: { salt: string; hash: string } } | null;

  useEffect(() => {
    if (fromSignup?.email && fromSignup.email !== ob.email) {
      ob.set({ email: fromSignup.email, firstName: fromSignup.firstName, lastName: fromSignup.lastName, passwordHash: fromSignup.passwordHash });
    }
  }, [fromSignup?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [ob.step]);

  const go = (step: number) => ob.set({ step });
  const finish = (withVisit: boolean) => {
    complete(
      {
        name: ob.firstName ?? '',
        lastName: ob.lastName,
        email: ob.email,
        passwordHash: ob.passwordHash,
        askBeforeRecording: true,
        forWhom: 'myself',
        reasons: ob.reasons,
        brushedOff: ob.brushedOff,
        consent: ob.consent,
        consentAccepted: true,
        ageConfirmed: ob.ageConfirmed,
      },
      withVisit && ob.visitDate ? { date: ob.visitDate, clinician: ob.clinician.trim() || undefined, specialty: ob.specialty } : undefined,
    );
    ob.reset();
    navigate('/home', { replace: true });
  };

  const hasAccount = useApp(selectHasAccount);
  if (hasAccount) return <Navigate to="/login" replace />;

  const step = Math.min(Math.max(ob.step, 1), TOTAL);
  const width = step === 4 ? 'ob-main--wide' : step === 3 ? 'ob-main--md' : '';

  return (
    <div className="pub">
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="pub-header ob-header">
        <Link to="/" className="pub-brand" aria-label={`${APP_NAME} home`}><Brand /></Link>
        <span className="ob-step" aria-live="polite">Step {step} of {TOTAL}</span>
        <div className="pub-actions">
          <Link to="/help-now" className="pub-help"><span className="help-long">Need help now? </span><span className="help-short">Help </span>988</Link>
          {step < TOTAL && (
            <button className="ob-later" onClick={() => navigate('/')} aria-label="Save and finish later">
              <span className="later-long">Save and finish later</span><span className="later-short">Finish later</span>
            </button>
          )}
        </div>
      </header>

      <main id="main" className={`ob-main ${width}`}>
        <div className="ob-progress" style={{ gridTemplateColumns: `repeat(${TOTAL}, 1fr)` }} role="img" aria-label={`Step ${step} of ${TOTAL}`}>
          {Array.from({ length: TOTAL }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}
        </div>

        {step === 1 && <WhatBrings onNext={() => go(2)} />}
        {step === 2 && <Consent onBack={() => go(1)} onNext={() => go(3)} />}
        {step === 3 && <ImportNotes onBack={() => go(2)} onNext={() => go(4)} />}
        {step === 4 && <QuickTry onBack={() => go(3)} onNext={() => go(5)} />}
        {step === 5 && <NextVisit onBack={() => go(4)} onFinish={finish} />}
      </main>
    </div>
  );
}

function Actions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="ob-actions">
      {onBack && <button className="btn btn--outline" onClick={onBack}>Back</button>}
      <span className="spacer" />
      {children}
    </div>
  );
}

/* ---------- Step 1 · What brings you here? ---------- */
function WhatBrings({ onNext }: { onNext: () => void }) {
  const { reasons, brushedOff, set } = useOnboarding();
  const toggle = (r: string) => {
    if (r === 'Not sure yet') return set({ reasons: reasons.includes(r) ? [] : [r] });
    const without = reasons.filter((x) => x !== 'Not sure yet');
    set({ reasons: without.includes(r) ? without.filter((x) => x !== r) : [...without, r] });
  };
  return (
    <>
      <h1>What brings you here?</h1>
      <p className="pub-sub">Pick any that fit. This isn’t a diagnosis. It helps us suggest the right playbooks.</p>
      <div className="chips chips--soft" role="group" aria-label="What brings you here">
        {REASONS.map((r) => <Chip key={r} selected={reasons.includes(r)} onClick={() => toggle(r)}>{r}</Chip>)}
      </div>
      <div className="pcard pcard--muted" style={{ padding: 20 }}>
        <span className="eyebrow" id="brushed">Has a doctor brushed this off before?</span>
        <div className="chips chips--soft" role="group" aria-labelledby="brushed">
          {(['Yes', 'Not sure', 'No'] as const).map((o) => (
            <Chip key={o} selected={brushedOff === o} onClick={() => set({ brushedOff: brushedOff === o ? undefined : o })}>{o}</Chip>
          ))}
        </div>
      </div>
      <Actions>
        <button className="link-btn" onClick={() => { set({ reasons: [], brushedOff: undefined }); onNext(); }}>Skip</button>
        <button className="btn btn--primary" onClick={onNext}>Continue</button>
      </Actions>
    </>
  );
}

/* ---------- Step 2 · Privacy and consent ---------- */
function Consent({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { consent, ageConfirmed, set } = useOnboarding();
  const canContinue = consent.saveStory && ageConfirmed;
  const rows: { key: keyof typeof consent; label: ReactNode; required?: boolean }[] = [
    { key: 'saveStory', label: <>Save my story and visit notes <span className="small muted">(needed to use the app)</span></>, required: true },
    { key: 'makeSummaries', label: 'Use my words to make doctor-ready summaries' },
    { key: 'anonymousRatings', label: 'Help improve playbooks with anonymous ratings' },
  ];
  return (
    <>
      <h1>Your data, your choice</h1>
      <div className="pcard pcard--active" style={{ padding: 20 }}>
        <p><strong>We never sell your data.</strong> You can export or delete everything anytime.</p>
      </div>
      <div className="toggles">
        {rows.map((r) => {
          const on = !!consent[r.key];
          const id = `consent-${r.key}`;
          return (
            <div className="toggle-row" key={r.key}>
              <span id={id}>{r.label}</span>
              <button
                className="switch"
                role="switch"
                aria-checked={on}
                aria-labelledby={id}
                onClick={() => set({ consent: { ...consent, [r.key]: !on } })}
              />
            </div>
          );
        })}
      </div>
      <p className="small muted">Recording a visit always asks again, for you and your doctor.</p>
      <Checkbox checked={ageConfirmed} onChange={(v) => set({ ageConfirmed: v })}>
        I confirm I’m 18 or older and live in the United States.
      </Checkbox>
      <p className="small muted">{APP_NAME} doesn’t diagnose or give medical advice.</p>
      {!canContinue && (
        <p className="small muted" id="consent-needed">
          To continue, turn on “Save my story and visit notes” and confirm you’re 18+ in the US.
        </p>
      )}
      <Actions onBack={onBack}>
        <button className="btn btn--primary" disabled={!canContinue} aria-describedby={canContinue ? undefined : 'consent-needed'} onClick={onNext}>
          I agree, continue
        </button>
      </Actions>
    </>
  );
}

/* ---------- Step 3 · Import my notes (optional) ---------- */
const PasteIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="10" width="36" height="46" rx="6" fill="#fff" stroke="#1e2a44" strokeWidth="2.5" /><rect x="24" y="6" width="16" height="10" rx="3" fill="#1f6b63" /><path d="M22 28h20M22 36h20M22 44h12" stroke="#1e2a44" strokeWidth="2.5" strokeLinecap="round" /></svg>
);
const CameraIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="18" width="48" height="34" rx="7" fill="#fff" stroke="#1e2a44" strokeWidth="2.5" /><path d="M22 18l4-7h12l4 7" fill="#fff" stroke="#1e2a44" strokeWidth="2.5" strokeLinejoin="round" /><circle cx="32" cy="35" r="10" fill="#1f6b63" /></svg>
);
const FileIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 6h22l12 12v40H16z" fill="#fff" stroke="#1e2a44" strokeWidth="2.5" strokeLinejoin="round" /><path d="M38 6v12h12" fill="none" stroke="#1e2a44" strokeWidth="2.5" /><path d="M32 46V28M24 36l8-8 8 8" stroke="#1f6b63" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Paste / photo / file import. Shared by onboarding (step 3) and Visits → Before appointment. */
export function ImportPanel({ onAdded }: { onAdded?: () => void }) {
  const navigate = useNavigate();
  const addEvidence = useApp((s) => s.addEvidence);
  const [mode, setMode] = useState<'paste' | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spotted = useMemo(() => matchSymptoms(text), [text]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (hasCrisisLanguage(t)) {
      setText('');
      navigate('/help/now');
      return;
    }
    addEvidence({ date: todayISO(), type: 'note', title: 'Imported note', detail: t.slice(0, 4000) });
    onAdded?.();
    setText('');
    setMode(null);
    setMessage(`Added to your history${spotted.length ? ` — we spotted: ${spotted.slice(0, 3).join('; ')}` : ''}.`);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
      setText((await f.text()).slice(0, 4000));
      setMode('paste');
      setMessage(`Loaded “${f.name}”. Check it, then add it to your history.`);
    } else {
      setMode('paste');
      setMessage(`Reading ${f.type.startsWith('image/') ? 'photos' : 'PDFs'} is coming soon. For now, type or paste what’s on it below.`);
    }
  };

  return (
    <>
      <div className="import-grid">
        <button className="choice import-card" aria-pressed={mode === 'paste'} onClick={() => { setMode('paste'); setMessage(null); }}>
          <div className="art"><PasteIcon /></div>
          <h2>Paste notes</h2>
          <p>From your phone’s notes app</p>
        </button>
        <button className="choice import-card" onClick={() => photoRef.current?.click()}>
          <div className="art"><CameraIcon /></div>
          <h2>Snap a photo</h2>
          <p>Of a paper list or med label</p>
        </button>
        <button className="choice import-card" onClick={() => fileRef.current?.click()}>
          <div className="art"><FileIcon /></div>
          <h2>Upload a file</h2>
          <p>PDF or visit summary</p>
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {message && <p className="small" role="status">{message}</p>}
      {mode === 'paste' && (
        <div className="pcard">
          <label htmlFor="paste" className="label">Your notes</label>
          <textarea id="paste" className="textarea" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Oct 2 – dose went up. Since then sleepy all day, dizzy when I stand…" />
          {spotted.length > 0 && <p className="small muted">We spotted: {spotted.slice(0, 3).join('; ')}</p>}
          <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} disabled={!text.trim()} onClick={add}>Add to my history</button>
        </div>
      )}
    </>
  );
}

function ImportNotes({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { imported, set } = useOnboarding();
  return (
    <>
      <h1>Already keep track somewhere? Bring it with you.</h1>
      <p className="pub-sub">No need to start over. We’ll sort it into your history.</p>
      <ImportPanel onAdded={() => set({ imported: imported + 1 })} />
      {imported > 0 && <p className="small muted">{imported} note{imported > 1 ? 's' : ''} added.</p>}

      <Actions onBack={onBack}>
        <button className="link-btn" onClick={onNext}>I don’t have notes</button>
        <button className="btn btn--primary" onClick={onNext}>Continue</button>
      </Actions>
    </>
  );
}

/* ---------- Step 4 · Quick try: see your words in doctor terms ---------- */
function QuickTry({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const navigate = useNavigate();
  const { quickSaved, set } = useOnboarding();
  const saveSummary = useApp((s) => s.saveSummary);
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState(false);
  const { supported, listening, buttonProps } = useSpeechInput(text, (v) => { setText(v); setEdits({}); });

  const crisis = hasCrisisLanguage(text);
  const lines: QuickLine[] = useMemo(() => (crisis ? [] : quickTranslate(text)), [text, crisis]);
  const shown = lines.map((l, i) => ({ ...l, text: edits[i] ?? l.text, edited: edits[i] !== undefined }));

  const save = () => {
    if (crisis) {
      setText('');
      navigate('/help/now');
      return;
    }
    const symptomLines = shown.filter((l) => l.label !== 'Duration');
    const duration = shown.find((l) => l.label === 'Duration');
    const field = (key: FieldKey, label: string, clinical?: string, extra?: Partial<SummaryField>): SummaryField =>
      ({ key, label, clinical: clinical || 'Not discussed', ...extra });
    saveSummary({
      opening: text.trim(),
      fields: [
        field('symptoms', 'Symptoms', symptomLines.map((l) => l.text).join('; '), { quote: text.trim(), editedByPatient: symptomLines.some((l) => l.edited) }),
        field('onset', 'Onset', duration?.text),
        field('frequency', 'Frequency'),
        field('severity', 'Severity'),
        field('triggers', 'Triggers'),
        field('tried', 'Tried'),
      ],
    });
    set({ quickSaved: true });
    onNext();
  };

  return (
    <>
      <h1 style={{ textAlign: 'center' }}>Try it: tell us one thing that’s been hard lately</h1>
      <div className="try-grid">
        <section className="pcard" aria-labelledby="you-say">
          <span className="eyebrow" id="you-say">You say</span>
          {supported && (
            <div className="try-talk">
              <button {...buttonProps}>{listening ? 'Listening' : 'Talk'}</button>
              <span className="muted">{listening ? 'Release to stop' : 'Hold to talk, or type below'}</span>
            </div>
          )}
          <label htmlFor="try" className="sr-only">Type what’s been hard</label>
          <textarea id="try" className="textarea" value={text} onChange={(e) => { setText(e.target.value); setEdits({}); }}
            placeholder="e.g. I can’t sleep and I’ve stopped seeing my friends. It’s been months." />
        </section>

        <section className="pcard reads" aria-labelledby="doc-reads" aria-live="polite">
          <span className="eyebrow" id="doc-reads">Your doctor reads</span>
          {crisis ? (
            <div className="pcard pcard--crisis" style={{ padding: 16 }}>
              <p><strong>It sounds like things might be really hard right now.</strong> You don’t have to go through it alone.</p>
              <Link to="/help-now" className="btn btn--danger" style={{ alignSelf: 'flex-start' }}>Call or text 988</Link>
            </div>
          ) : shown.length ? (
            <>
              {shown.map((l, i) => (
                <div className="line" key={l.label + i}>
                  {editing ? (
                    <label>
                      <strong>{l.label}:</strong>
                      <input className="input" value={l.text} onChange={(e) => setEdits({ ...edits, [i]: e.target.value })} />
                    </label>
                  ) : (
                    <p><strong>{l.label}:</strong> {l.text}</p>
                  )}
                </div>
              ))}
              <span className="pill pill--amber">{quickSaved ? 'Your first entry is saved.' : 'That’s it. This becomes your first entry.'}</span>
            </>
          ) : (
            <p className="muted">{text.trim() ? 'Keep going — add how it affects you, or how long it’s been.' : 'As you talk or type, you’ll see how a doctor would read it.'}</p>
          )}
          <p className="small muted" style={{ marginTop: 'auto' }}>Not a diagnosis. Your words always win.</p>
        </section>
      </div>

      <Actions onBack={onBack}>
        <button className="link-btn" onClick={onNext}>Skip for now</button>
        {shown.length > 0 && (
          <button className="link-btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit wording'}</button>
        )}
        <button className="btn btn--primary" disabled={!text.trim() || (!crisis && !shown.length)} onClick={save}>Looks right, continue</button>
      </Actions>
    </>
  );
}

/* ---------- Step 5 · Set next visit date ---------- */
function NextVisit({ onBack, onFinish }: { onBack: () => void; onFinish: (withVisit: boolean) => void }) {
  const { visitDate, clinician, specialty, set } = useOnboarding();
  return (
    <>
      <h1>Do you have an appointment coming up?</h1>
      <p className="pub-sub">We’ll remind you to get ready a few days before.</p>
      <div className="field">
        <label htmlFor="vdate">Date</label>
        <input id="vdate" type="date" className="input" min={todayISO()} value={visitDate} onChange={(e) => set({ visitDate: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="who">Who are you seeing? <span className="muted">(optional)</span></label>
        <input id="who" className="input" placeholder="Dr. Name / Clinic" value={clinician} onChange={(e) => set({ clinician: e.target.value })} />
      </div>
      <div className="chips chips--soft" role="group" aria-label="Type of visit">
        {SPECIALTIES.map((s) => <Chip key={s} selected={specialty === s} onClick={() => set({ specialty: specialty === s ? undefined : s })}>{s}</Chip>)}
      </div>
      <Actions onBack={onBack}>
        <button className="link-btn" onClick={() => onFinish(false)}>No visit yet</button>
        <button className="btn btn--primary" disabled={!visitDate} onClick={() => onFinish(true)}>Finish</button>
      </Actions>
    </>
  );
}
