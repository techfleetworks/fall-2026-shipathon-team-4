import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSpeechInput } from '../../components/TalkOrType';
import { Checkbox, Chip, ChipMulti, ChipSelect, Disclaimer, useToast } from '../../components/ui';
import { SCRIPTS } from '../../data/scripts';
import { buildBriefSnapshot } from '../../lib/brief';
import { formatDate, formatShort, todayISO, toISODate } from '../../lib/dates';
import { parseNotes, type FoundItem, type FoundKind } from '../../lib/importParse';
import { draftPlaybook } from '../../lib/playbook';
import { hasCrisisLanguage } from '../../lib/safety';
import { isLinkActive, selectLatestSummary, useApp, useDraft } from '../../lib/store';
import {
  FREQUENCY_CHOICES,
  IMPACT_CHOICES,
  ONSET_CHOICES,
  TRIED_CHOICES,
  TRIGGER_CHOICES,
} from '../../lib/translate';
import { requestPrepSummary } from '../../lib/api';
import { storyDraftHasCrisis } from '../../lib/guardrails/enforce';
import { applyOverrides, useServerSummary } from '../../lib/useServerSummary';
import type { FieldKey, StoryDraft, Visit } from '../../lib/types';
import { Priorities, suggestionsFrom } from '../Brief';
import { ShareLinkRow, linkUrl } from '../Visits';
import { formatTime, Modal, useVisitParam, VisitLayout } from './common';

/* ======================================================================
   B1 · Name how I feel + see it in doctor terms + edit (side by side)
   ====================================================================== */

const QUESTIONS = [
  'What’s been going on, and when did it start?',
  'How often does it happen?',
  'How much is it affecting you?',
  'What makes it better or worse?',
  'What have you tried?',
];

/** The free-text part of each question, so crisis checks and "Talk" know what to touch. */
function textOf(d: StoryDraft, q: number): string {
  return [d.opening, d.frequency.text, d.severity.text, d.triggers.text, d.tried.text][q - 1] ?? '';
}
function withText(d: StoryDraft, q: number, text: string): Partial<StoryDraft> {
  if (q === 1) return { opening: text };
  if (q === 2) return { frequency: { ...d.frequency, text } };
  if (q === 3) return { severity: { ...d.severity, text } };
  if (q === 4) return { triggers: { ...d.triggers, text } };
  return { tried: { ...d.tried, text } };
}

/** Story with crisis text removed from every free-text answer (not just the current question). */
function withoutCrisisText(d: StoryDraft): Partial<StoryDraft> {
  const clean = (t: string) => (hasCrisisLanguage(t) ? '' : t);
  return {
    opening: clean(d.opening),
    onset: { ...d.onset, text: clean(d.onset.text) },
    frequency: { ...d.frequency, text: clean(d.frequency.text) },
    severity: { ...d.severity, text: clean(d.severity.text) },
    triggers: { ...d.triggers, text: clean(d.triggers.text) },
    tried: { ...d.tried, text: clean(d.tried.text), outcome: clean(d.tried.outcome), medName: clean(d.tried.medName), medDose: clean(d.tried.medDose), medDuration: clean(d.tried.medDuration) },
    overrides: {},
  };
}

export function NameHowIFeel() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { draft, update, reset } = useDraft();
  const saveSummary = useApp((s) => s.saveSummary);
  const latest = useApp(selectLatestSummary);
  const q = Math.min(Math.max(Number(params.get('q')) || 1, 1), 5);
  const setQ = (n: number) => setParams(n === 1 ? {} : { q: String(n) }, { replace: true });

  const text = textOf(draft, q);
  const { supported, listening, buttonProps } = useSpeechInput(text, (v) => update(withText(useDraft.getState().draft, q, v)));
  const crisis = hasCrisisLanguage(text) || Object.values(draft.overrides ?? {}).some((o) => hasCrisisLanguage(o));
  // "Your doctor reads" comes from the backend server (engine + guardrails run there), after a short pause in typing.
  const preview = useServerSummary(draft);
  const fields = useMemo(() => applyOverrides(preview.fields, draft.overrides), [preview.fields, draft.overrides]);
  // Crisis anywhere in the story (any question, any rewrite), not just the question on screen.
  const anyCrisis = storyDraftHasCrisis(draft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FieldKey | null>(null);

  if (!visit) return <Navigate to="/visits" replace />;

  const toHelp = () => {
    update(withoutCrisisText(useDraft.getState().draft));
    navigate('/help/now', { replace: true });
  };
  const next = async () => {
    if (crisis || anyCrisis) return toHelp();
    if (q < 5) return setQ(q + 1);
    // Save: ask the server once more so what's saved matches the latest answers, never a stale preview.
    setSaving(true);
    setSaveError(null);
    const current = useDraft.getState().draft;
    const { overrides, ...engineInput } = current;
    const out = await requestPrepSummary(engineInput as StoryDraft);
    setSaving(false);
    if (out.status === 'crisis') return toHelp();
    if (out.status === 'rejected' && out.error.code === 'EMPTY_STORY') return navigate(`/visits/${visit.id}/before/summary`);
    if (out.status === 'blocked') return setSaveError(out.message);
    if (out.status !== 'ok') return setSaveError(out.status === 'rejected' ? out.error.message : out.message);
    saveSummary({ opening: current.opening.trim(), fields: applyOverrides(out.fields, overrides) });
    reset();
    navigate(`/visits/${visit.id}/before/summary`);
  };
  // Skip runs the same crisis check as Next, so typed crisis text can never ride into the summary or brief.
  const skip = () => {
    if (crisis || anyCrisis) return toHelp();
    if (q < 5) return setQ(q + 1);
    void next();
  };

  return (
    <VisitLayout visit={visit} stage="before" step="">
      <div className="b1-grid">
        <section className="panel">
          <span className="eyebrow-soft">You say · question {q} of 5</span>
          <h1 className="panel-title">{QUESTIONS[q - 1]}</h1>
          {q === 1 && (
            <>
              <ChipSelect label="When it started" options={ONSET_CHOICES} value={draft.onset.choice} onChange={(choice) => update({ onset: { ...draft.onset, choice } })} />
              <Checkbox checked={!!draft.onset.afterMedChange} onChange={(afterMedChange) => update({ onset: { ...draft.onset, afterMedChange } })}>
                It started after a medication change
              </Checkbox>
            </>
          )}
          {q === 2 && <ChipSelect label="How often" options={FREQUENCY_CHOICES} value={draft.frequency.choice} onChange={(choice) => update({ frequency: { ...draft.frequency, choice } })} />}
          {q === 3 && (
            <>
              <div className="scale scale--11" role="group" aria-label="On most days, 0 to 10">
                {Array.from({ length: 11 }, (_, n) => (
                  <button key={n} type="button" aria-pressed={draft.severity.score === n}
                    onClick={() => update({ severity: { ...draft.severity, score: draft.severity.score === n ? undefined : n } })}>{n}</button>
                ))}
              </div>
              <div className="row row--between small muted"><span>Not at all</span><span>Worst</span></div>
              <ChipMulti label="Affects" options={IMPACT_CHOICES} value={draft.severity.impacts} onChange={(impacts) => update({ severity: { ...draft.severity, impacts } })} />
            </>
          )}
          {q === 4 && <ChipMulti label="Triggers" options={TRIGGER_CHOICES} value={draft.triggers.choices} onChange={(choices) => update({ triggers: { ...draft.triggers, choices } })} />}
          {q === 5 && (
            <>
              <ChipMulti label="Tried" options={TRIED_CHOICES} value={draft.tried.choices} onChange={(choices) => update({ tried: { ...draft.tried, choices } })} />
              {draft.tried.choices.includes('Medication') && (
                <div className="grid-3">
                  <div className="field"><label htmlFor="med">Medication</label>
                    <input id="med" className="input" value={draft.tried.medName} onChange={(e) => update({ tried: { ...draft.tried, medName: e.target.value } })} /></div>
                  <div className="field"><label htmlFor="dose">Dose</label>
                    <input id="dose" className="input" placeholder="e.g. 50 mg" value={draft.tried.medDose} onChange={(e) => update({ tried: { ...draft.tried, medDose: e.target.value } })} /></div>
                  <div className="field"><label htmlFor="dur">How long</label>
                    <input id="dur" className="input" placeholder="e.g. 3 months" value={draft.tried.medDuration} onChange={(e) => update({ tried: { ...draft.tried, medDuration: e.target.value } })} /></div>
                </div>
              )}
            </>
          )}

          <div className="talk-row">
            {supported && <button {...buttonProps}>{listening ? 'Listening' : 'Talk'}</button>}
            <span className="muted">{supported ? (listening ? 'Release to stop' : 'Hold to talk, or type') : 'Type it in your own words'}</span>
          </div>
          <label htmlFor="say" className="sr-only">Your words</label>
          <textarea id="say" className="textarea" value={text} onChange={(e) => update(withText(draft, q, e.target.value))}
            placeholder={['Most days I…', 'It happens…', 'I’ve stopped being able to…', 'It’s worse when…', 'I tried…'][q - 1]} />

          {crisis && (
            <div className="pcard pcard--crisis" role="alert" style={{ padding: 16 }}>
              <strong>It sounds like things are really hard right now.</strong>
              <p className="small" style={{ margin: 0 }}>You don’t have to carry this alone. Talking to someone can help, right now.</p>
              <Link to="/help-now" className="btn btn--sm btn--danger" style={{ alignSelf: 'flex-start' }}>Talk to someone now</Link>
            </div>
          )}

          <div className="ob-actions">
            {q > 1 && <button className="btn btn--outline" onClick={() => setQ(q - 1)}>Back</button>}
            <button className="link-btn" onClick={skip}>Skip, I’m not sure</button>
            <span className="spacer" />
            <button className="btn btn--primary" onClick={() => void next()} disabled={saving} aria-busy={saving}>
              {q < 5 ? 'Next question' : saving ? 'Saving…' : 'Looks right, save'}
            </button>
          </div>
          {saveError && <p className="note" role="alert">{saveError}</p>}
          {latest && q === 1 && !draft.opening && (
            <p className="small muted">Your last story was saved {formatDate(toISODate(new Date(latest.createdAt)))}. Telling it again adds an update.</p>
          )}
        </section>

        <section className="panel panel--accent" aria-labelledby="reads">
          <span id="reads" className="eyebrow-soft">Your doctor reads · updates as you go</span>
          {preview.status === 'loading' && <p className="note" role="status">Updating…</p>}
          {(preview.status === 'unavailable' || preview.status === 'blocked') && <p className="note" role="status">{preview.message}</p>}
          <div className="kv">
            {fields.map((f) => (
              <div key={f.key} className="kv__row">
                {editing === f.key ? (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); setEditing(null); }}>
                    <label htmlFor={`ov-${f.key}`} className="sr-only">{f.label}</label>
                    <input id={`ov-${f.key}`} className="input" autoFocus defaultValue={f.clinical === 'Not discussed' ? '' : f.clinical}
                      onChange={(e) => update({ overrides: { ...useDraft.getState().draft.overrides, [f.key]: e.target.value } })} />
                    <button className="btn btn--sm" type="submit">Done</button>
                  </form>
                ) : (
                  <span>
                    <strong>{f.key === 'symptoms' ? 'Main concerns' : f.label}:</strong>{' '}
                    <span className={f.clinical === 'Not discussed' ? 'muted' : undefined}>{f.clinical === 'Not discussed' ? '[—]' : f.clinical}</span>
                    {f.editedByPatient && <span className="badge badge--soft" style={{ marginLeft: 6, fontSize: '0.75rem' }}>your wording</span>}{' '}
                    <button className="link-btn link-btn--inline" onClick={() => setEditing(f.key)} aria-label={`Edit ${f.label}`}>Edit</button>
                  </span>
                )}
                {f.quote && <span className="kv__quote">Your words: “{f.quote}”</span>}
              </div>
            ))}
          </div>
          <p className="note">Your words stay attached to every line. Tap Edit to change anything.</p>
        </section>
      </div>
    </VisitLayout>
  );
}

/* ======================================================================
   B2 · Import notes or photo — check each item before saving
   ====================================================================== */

const KIND_TO_EVIDENCE: Record<FoundKind, { type: 'medication' | 'symptom' | 'note'; title: string }> = {
  Medication: { type: 'medication', title: 'Medication' },
  Symptom: { type: 'symptom', title: 'Symptom' },
  'Side effect': { type: 'symptom', title: 'Side effect' },
  Other: { type: 'note', title: 'Imported note' },
};

export function ImportView({ visit }: { visit?: Visit }) {
  const navigate = useNavigate();
  const addEvidence = useApp((s) => s.addEvidence);
  const [text, setText] = useState('');
  const [items, setItems] = useState<FoundItem[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const back = visit ? `/visits/${visit.id}/before` : '/visits/history';

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const find = (t = text) => {
    if (hasCrisisLanguage(t)) { setText(''); navigate('/help/now'); return; }
    setItems(parseNotes(t));
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.type.startsWith('image/')) {
      setPhoto(URL.createObjectURL(f));
      setMessage('Reading photos is coming soon. For now, type what’s on it below and we’ll sort it.');
    } else if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
      const t = (await f.text()).slice(0, 6000);
      setText(t);
      setMessage(`Loaded “${f.name}”.`);
      find(t);
    } else {
      setMessage('Reading PDFs is coming soon. For now, paste the text below.');
    }
  };
  const checked = items.filter((i) => i.checked);
  const save = () => {
    if (checked.some((i) => hasCrisisLanguage(i.text))) { navigate('/help/now'); return; }
    checked.forEach((i) => {
      const e = KIND_TO_EVIDENCE[i.kind];
      addEvidence({ date: i.date, type: e.type, title: e.title, detail: i.text.slice(0, 300) });
    });
    showToast(`Saved ${checked.length} to your history`);
    setTimeout(() => navigate(back), 700);
  };
  const reset = () => { setText(''); setItems([]); setPhoto(null); setMessage(null); };

  return (
    <div className="two-col">
      <section className="panel">
        <span className="eyebrow-soft">What you added</span>
        {photo && <img src={photo} alt="Your photo (stays on this device)" className="import-photo" />}
        <label htmlFor="notes" className="sr-only">Paste or type your notes</label>
        <textarea id="notes" className="textarea" style={{ minHeight: 160 }} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'Paste notes, one per line. e.g.\nSertraline 50 mg started June\nOct 30 couldn’t sleep again\nNausea after pills in July'} />
        {message && <p className="small" role="status">{message}</p>}
        <div className="btn-row">
          <button className="btn btn--primary" disabled={!text.trim()} onClick={() => find()}>Find items</button>
          <button className="btn btn--outline" onClick={() => photoRef.current?.click()}>Snap a photo</button>
          <button className="btn btn--outline" onClick={() => fileRef.current?.click()}>Upload a file</button>
        </div>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {(items.length > 0 || photo) && <button className="btn btn--block btn--outline" onClick={reset}>Add another</button>}
      </section>

      <section className="panel">
        <span className="eyebrow-soft">We found · check before saving</span>
        {items.length === 0 ? (
          <p className="muted">Add your notes on the left and tap Find items. You’ll tick each one before anything is saved.</p>
        ) : (
          <ul className="found">
            {items.map((i) => (
              <li key={i.id}>
                <label className="check-row" style={{ flex: 1 }}>
                  <input type="checkbox" checked={i.checked} onChange={(e) => setItems(items.map((x) => (x.id === i.id ? { ...x, checked: e.target.checked } : x)))} />
                  <span className="check-box">{i.checked && '✓'}</span>
                  <span>“{i.text}”{i.dateLabel ? ` · ${i.dateLabel}` : ''}</span>
                </label>
                <span className="tag">{i.kind === 'Other' ? 'Skip?' : i.kind}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ob-actions" style={{ marginTop: 'auto' }}>
          <span className="spacer" />
          <Link to={back} className="link-btn">Cancel</Link>
          <button className="btn btn--primary" disabled={!checked.length} onClick={save}>Save {checked.length || ''} to my history</button>
        </div>
      </section>
      {toast}
    </div>
  );
}

export function ImportStep() {
  const visit = useVisitParam();
  if (!visit) return <Navigate to="/visits" replace />;
  return (
    <VisitLayout visit={visit} stage="before">
      <ImportView visit={visit} />
    </VisitLayout>
  );
}

/* ======================================================================
   B3 · Doctor summary
   ====================================================================== */

const SUMMARY_ROWS: { key: FieldKey; label: string }[] = [
  { key: 'symptoms', label: 'Main concerns' },
  { key: 'onset', label: 'How long' },
  { key: 'frequency', label: 'How often' },
  { key: 'severity', label: 'How bad' },
  { key: 'triggers', label: 'Better or worse with' },
];

export function DoctorSummaryStep() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const state = useApp();
  const latest = selectLatestSummary(state);
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!visit) return <Navigate to="/visits" replace />;
  const base = `/visits/${visit.id}/before`;

  if (!latest) {
    return (
      <VisitLayout visit={visit} stage="before" step="summary">
        <section className="panel panel--accent">
          <h1 className="panel-title">Your doctor summary</h1>
          <p className="muted">It builds itself from your words. Start with step 1 — rough is fine.</p>
          <Link to={base} className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>Name how I feel</Link>
        </section>
      </VisitLayout>
    );
  }

  const field = (k: FieldKey) => latest.fields.find((f) => f.key === k);
  const show = (k: FieldKey) => {
    const f = field(k);
    return f && f.clinical !== 'Not discussed' ? f.clinical : undefined;
  };
  const updated = toISODate(new Date(latest.createdAt));
  const tried = show('tried');
  const meds = state.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''} since ${formatShort(m.started)}${m.note ? ` · ${m.note}` : ''}`);

  const startEdit = () => {
    setVals(Object.fromEntries(latest.fields.map((f) => [f.key, f.clinical === 'Not discussed' ? '' : f.clinical])));
    setEditing(true);
  };
  const saveEdit = () => {
    if (Object.values(vals).some((v) => hasCrisisLanguage(v))) { navigate('/help/now'); return; }
    const fields = latest.fields.map((f) => {
      const v = vals[f.key]?.trim() ?? '';
      const before = f.clinical === 'Not discussed' ? '' : f.clinical;
      return v === before ? f : { ...f, clinical: v || 'Not discussed', editedByPatient: true };
    });
    state.saveSummary({ opening: latest.opening, fields });
    setEditing(false);
  };

  return (
    <VisitLayout visit={visit} stage="before" step="summary">
      <section className="panel panel--accent">
        <div className="row row--between row--wrap">
          <h1 className="panel-title">Summary for {visit.clinician || 'your doctor'}</h1>
          <span className="tag">{updated === todayISO() ? 'Updated today' : `Updated ${formatShort(updated)}`}</span>
        </div>
        {editing ? (
          <div className="stack">
            {[...SUMMARY_ROWS, { key: 'tried' as FieldKey, label: 'Treatment so far' }].map((r) => (
              <div className="field" key={r.key}>
                <label htmlFor={`sum-${r.key}`}>{r.label}</label>
                <textarea id={`sum-${r.key}`} className="textarea" style={{ minHeight: 56 }} value={vals[r.key] ?? ''} placeholder="Not discussed"
                  onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })} />
              </div>
            ))}
          </div>
        ) : (
          <div className="two-col two-col--plain">
            <div className="kv">
              <span className="eyebrow-soft">Symptoms</span>
              {SUMMARY_ROWS.map((r) => show(r.key) && (
                <div className="kv__row" key={r.key}>
                  <span><strong>{r.label}:</strong> {show(r.key)}</span>
                  {field(r.key)?.editedByPatient && <span className="small muted">Your wording</span>}
                </div>
              ))}
            </div>
            <div className="kv">
              <span className="eyebrow-soft">Treatment so far</span>
              {tried && <span>{tried}</span>}
              {meds.map((m) => <span key={m}><strong>{m}</strong></span>)}
              {!tried && !meds.length && <span className="muted">Not discussed</span>}
            </div>
          </div>
        )}
        <p className="note">Built from your words and imported notes. Patient-reported.</p>
        <Disclaimer />
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          {editing ? (
            <>
              <button className="btn btn--outline" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={saveEdit}>Save changes</button>
            </>
          ) : (
            <>
              <button className="btn btn--outline" onClick={startEdit}>Edit</button>
              <Link to={`${base}/brief`} className="btn btn--primary">Next: Talking points</Link>
            </>
          )}
        </div>
      </section>
    </VisitLayout>
  );
}

/* ======================================================================
   B4 · Talking points (top 3) + playbooks to bring
   ====================================================================== */

const ASKING = ['Medication review', 'Referral', 'Test or lab work', 'Therapist referral', 'Follow-up plan', 'Second opinion'];

export function TalkingPointsStep() {
  const visit = useVisitParam();
  const state = useApp();
  const latest = selectLatestSummary(state);
  if (!visit) return <Navigate to="/visits" replace />;
  const update = (patch: Partial<Visit>) => state.updateVisit(visit.id, patch);
  const attached = visit.scripts ?? [];
  const suggested = [...new Set([...attached, ...draftPlaybook(state).scriptIds, ...state.savedScripts])].slice(0, 6);

  return (
    <VisitLayout visit={visit} stage="before" step="brief">
      <div className="b4-grid">
        <section className="panel">
          <div className="row row--between row--wrap">
            <h1 className="panel-title">Your talking points</h1>
            {visit.priorities.length > 0 && <span className="pill pill--amber">Ready for your visit</span>}
          </div>
          <p className="muted" style={{ margin: 0 }}>Your visit goes fast. Drag to put what matters most first.</p>
          <Priorities visit={visit} update={update} suggestions={suggestionsFrom(latest?.fields.find((f) => f.key === 'symptoms')?.clinical)} bare />
          <div className="stack-sm">
            <span className="eyebrow-soft">What I’m asking for</span>
            <ChipMulti label="What I'm asking for" options={[...new Set([...ASKING, ...visit.askingFor])]} value={visit.askingFor} onChange={(askingFor) => update({ askingFor })} />
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow-soft">Playbooks to bring</span>
          <ul className="found">
            {suggested.map((id) => {
              const s = SCRIPTS.find((x) => x.id === id);
              if (!s) return null;
              const on = attached.includes(id);
              return (
                <li key={id}>
                  <span style={{ flex: 1 }}>{s.situation}</span>
                  <button className={on ? 'tag tag--btn' : 'link-btn'} aria-pressed={on}
                    onClick={() => update({ scripts: on ? attached.filter((x) => x !== id) : [...attached, id] })}>
                    {on ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link to="/playbooks/others" className="link-btn" style={{ alignSelf: 'flex-start' }}>Browse more playbooks</Link>
          <Link to={`/visits/${visit.id}/before/today`} className="btn btn--primary btn--block" style={{ marginTop: 'auto' }}>Next: Prep</Link>
        </section>
      </div>
    </VisitLayout>
  );
}

/* ======================================================================
   B5 · Prep — feeling, editable checklist, breathing
   ====================================================================== */

const FEELINGS = ['Calm', 'Nervous', 'Overwhelmed', 'Hopeful', 'Frustrated', 'Scared'];
const DEFAULT_CHECKS = ['Read my top 3 talking points', 'Pick one playbook to keep handy', 'Bring ID, med list, phone charged'];

export function PrepStep() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const updateVisit = useApp((s) => s.updateVisit);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState('');
  if (!visit) return <Navigate to="/visits" replace />;
  const prep = visit.prep ?? { checks: [], extra: [] };
  const set = (patch: Partial<typeof prep>) => updateVisit(visit.id, { prep: { ...prep, ...patch } });
  const items = [...DEFAULT_CHECKS, ...prep.extra];
  const when = visit.date === todayISO() ? `Today${visit.time ? `, ${formatTime(visit.time)}` : ''}` : visit.time ? formatTime(visit.time) : undefined;

  const add = () => {
    const t = newItem.trim();
    if (!t) return;
    if (hasCrisisLanguage(t)) { navigate('/help/now'); return; }
    set({ extra: [...prep.extra, t] });
    setNewItem('');
    setAdding(false);
  };

  return (
    <VisitLayout visit={visit} stage="before" step="today" crumbExtra={when}>
      <h1>You’ve already done the hard part.</h1>
      <p className="muted" style={{ marginTop: -6 }}>Three small things before you go. Skip any.</p>
      <section className="panel">
        <span className="eyebrow-soft">How are you feeling right now?</span>
        <ChipSelect label="How are you feeling" options={FEELINGS} value={prep.feeling} onChange={(feeling) => set({ feeling })} />
        {(prep.feeling === 'Overwhelmed' || prep.feeling === 'Scared') && (
          <p className="small" style={{ margin: 0 }}>That makes sense. Try the breathing, and remember you can hand your phone to the doctor instead of saying it all.</p>
        )}
      </section>
      <div className="b5-grid">
        <section className="panel">
          <span className="eyebrow-soft">Checklist</span>
          <div className="checklist">
            {items.map((item) => (
              <div key={item} className="checklist__row">
                <Checkbox checked={prep.checks.includes(item)} onChange={(on) => set({ checks: on ? [...prep.checks, item] : prep.checks.filter((c) => c !== item) })}>{item}</Checkbox>
                {prep.extra.includes(item) && (
                  <button className="icon-btn" aria-label={`Remove "${item}"`} onClick={() => set({ extra: prep.extra.filter((x) => x !== item), checks: prep.checks.filter((c) => c !== item) })}>×</button>
                )}
              </div>
            ))}
          </div>
          {adding ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <label htmlFor="own" className="sr-only">Add your own</label>
              <input id="own" className="input" autoFocus value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="e.g. Write down my questions" />
              <button className="btn btn--sm" type="submit" disabled={!newItem.trim()}>Add</button>
            </form>
          ) : (
            <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>+ Add your own</button>
          )}
        </section>
        <BreathingPanel />
      </div>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <Link to={`/visits/${visit.id}/before/share`} className="btn btn--primary">Next: Share</Link>
      </div>
    </VisitLayout>
  );
}

/** In 4 · hold 2 · out 6. Duration adjustable past 60 seconds. */
function BreathingPanel() {
  const [minutes, setMinutes] = useState(1);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const total = minutes * 60;
  const done = running && elapsed >= total;
  useEffect(() => {
    if (!running || done) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, done]);
  const c = elapsed % 12;
  const phase = !running ? 'idle' : done ? 'done' : c < 4 ? 'in' : c < 6 ? 'hold' : 'out';
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const scale = reduce || phase === 'idle' || phase === 'done' ? 1 : phase === 'out' ? 0.8 : 1.2;
  const left = total - elapsed;

  return (
    <section className="panel panel--muted breath-panel" aria-label="Optional breathing">
      <span className="eyebrow-soft">Optional · breathing</span>
      <p style={{ margin: 0 }}>Follow the circle — breathe in, hold, out.</p>
      <div className="breath-ring" aria-live="polite" style={{ transform: `scale(${scale})`, transitionDuration: phase === 'in' ? '4s' : phase === 'out' ? '6s' : '0.3s' }}>
        {phase === 'idle' ? 'Breathe in' : phase === 'done' ? 'Done' : phase === 'in' ? 'Breathe in' : phase === 'hold' ? 'Hold' : 'Breathe out'}
      </div>
      <span className="small muted">{running && !done ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'In 4 · hold · out 6'}</span>
      <div className="chips" role="group" aria-label="How long">
        {[1, 3, 5].map((m) => <Chip key={m} selected={minutes === m} onClick={() => { setMinutes(m); setRunning(false); setElapsed(0); }}>{m} min</Chip>)}
      </div>
      <button className="btn btn--outline" onClick={() => { if (running && !done) { setRunning(false); } else { setElapsed(0); setRunning(true); } }}>
        {running && !done ? 'Stop' : done ? 'Again' : 'Start'}
      </button>
    </section>
  );
}

/* ======================================================================
   B6 · Export PDF / share link (dialog)
   ====================================================================== */

const EXPIRY = [
  { label: 'In 24 hours', days: 1 },
  { label: 'In 7 days', days: 7 },
  { label: 'In 30 days', days: 30 },
];

export function ShareStep() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const state = useApp();
  const [open, setOpen] = useState(true);
  const [tp, setTp] = useState(true);
  const [sum, setSum] = useState(true);
  const [days, setDays] = useState(7);
  const [made, setMade] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  if (!visit) return <Navigate to="/visits" replace />;
  const active = (state.shareLinks ?? []).filter((l) => isLinkActive(l));

  const create = async () => {
    const l = state.createShareLink(buildBriefSnapshot(state, visit, { talkingPoints: tp, summary: sum }), days);
    state.updateVisit(visit.id, { shared: true });
    setMade(linkUrl(l));
    try { await navigator.clipboard.writeText(linkUrl(l)); showToast('Link made and copied'); } catch { showToast('Link made'); }
  };
  const pdf = () => {
    state.updateVisit(visit.id, { shared: true });
    navigate(`/visits/${visit.id}/at/room?print=1&tp=${tp ? 1 : 0}&sum=${sum ? 1 : 0}`);
  };

  return (
    <VisitLayout visit={visit} stage="before" step="share">
      <section className="panel">
        <h1 className="panel-title">Share your summary</h1>
        <p className="muted" style={{ margin: 0 }}>Download a PDF, or send a link that expires. No records system needed.</p>
        <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Share options</button>
        {active.length > 0 && (
          <>
            <span className="eyebrow-soft">Active links</span>
            {active.map((l) => <ShareLinkRow key={l.id} link={l} onCopied={showToast} />)}
          </>
        )}
      </section>

      {open && (
        <Modal title="Share your summary" onClose={() => setOpen(false)}>
          <span className="eyebrow-soft">Include</span>
          <div className="checklist">
            <div className="checklist__row"><Checkbox checked={tp} onChange={setTp}>Talking points</Checkbox></div>
            <div className="checklist__row"><Checkbox checked={sum} onChange={setSum}>Doctor summary</Checkbox></div>
          </div>
          <div className="grid-2">
            <button className="btn btn--primary" disabled={!tp && !sum} onClick={create}>Create link</button>
            <button className="btn btn--outline" disabled={!tp && !sum} onClick={pdf}>Download PDF</button>
          </div>
          <div className="field">
            <label htmlFor="exp">Link expires</label>
            <select id="exp" className="select input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {EXPIRY.map((e) => <option key={e.days} value={e.days}>{e.label}</option>)}
            </select>
          </div>
          {made && (
            <div className="quote small" role="status" style={{ wordBreak: 'break-all' }}>
              Your link: <a href={made}>{made}</a>
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Anyone with the link can view it until it expires. You can stop sharing anytime in <Link to="/settings/privacy">Settings</Link>.
            For now links open only on this device, because nothing is uploaded yet.
          </p>
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
            <button className="link-btn" onClick={() => setOpen(false)}>Done</button>
          </div>
        </Modal>
      )}
      {toast}
    </VisitLayout>
  );
}
