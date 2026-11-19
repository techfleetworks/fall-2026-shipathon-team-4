import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSpeechInput } from '../../components/TalkOrType';
import { Checkbox, Chip, ChipMulti, useToast } from '../../components/ui';
import { SCRIPTS } from '../../data/scripts';
import { buildBriefSnapshot } from '../../lib/brief';
import { shareEmailDraft } from '../../lib/shareEmail';
import { addDays, formatDate, formatShort, parseISO, todayISO, toISODate } from '../../lib/dates';
import { parseNotes, type FoundItem, type FoundKind } from '../../lib/importParse';
import { draftPlaybook } from '../../lib/playbook';
import { suggestQuestions } from '../../lib/questions/suggest';
import { hasCrisisLanguage } from '../../lib/safety';
import { isLinkActive, selectLatestSummary, selectVisitSummary, useApp, useDraft } from '../../lib/store';
import { requestPrepSummary } from '../../lib/api';
import { translateStoryGuarded } from '../../lib/engine';
import { storyDraftHasCrisis } from '../../lib/guardrails/enforce';
import { applyOverrides, useServerSummary } from '../../lib/useServerSummary';
import type { FieldKey, ShareLink, StoryDraft, Visit } from '../../lib/types';
import { Priorities, suggestionsFrom } from '../Brief';
import { ShareLinkRow, linkUrl } from '../Visits';
import { formatTime, Modal, prepFeelings, useVisitParam, VisitLayout } from './common';

/* ======================================================================
   B1 · Name how I feel + see it in doctor terms + edit (side by side)
   ====================================================================== */

/** B1 has one question. Everything the person says goes into the story's opening, which the engine reads. */
const QUESTION = 'How are you feeling?';
const HINT = 'Describe your symptoms, how often it happens, how bad it is, and what you have tried so far.';

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
  const { draft, update, reset } = useDraft();
  const saveSummary = useApp((s) => s.saveSummary);
  const latest = useApp(selectLatestSummary);
  // The story already saved for this visit: shown again when the person comes back to this step.
  const saved = useApp((s) => (visit ? selectVisitSummary(s, visit) : undefined));
  useEffect(() => {
    if (!saved || useDraft.getState().draft.opening.trim()) return;
    const overrides: Partial<Record<FieldKey, string>> = {};
    saved.fields.forEach((f) => { if (f.editedByPatient) overrides[f.key] = f.clinical; });
    update({ opening: saved.opening, overrides });
  }, [visit?.id, saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = draft.opening;
  const { supported, listening, toggleProps } = useSpeechInput(text, (v) => update({ opening: v }));
  const crisis = hasCrisisLanguage(text) || Object.values(draft.overrides ?? {}).some((o) => hasCrisisLanguage(o));
  // "Your doctor reads" comes from the backend server (engine + guardrails run there), after a short pause in typing.
  const preview = useServerSummary(draft);
  // Unchanged saved story: show what was saved while a fresh preview isn't available.
  const unchanged = !!saved && draft.opening.trim() === saved.opening
    && Object.entries(draft.overrides ?? {}).every(([k, v]) => saved.fields.find((f) => f.key === k)?.clinical === v);
  const showSaved = unchanged && preview.status !== 'ok';
  const fields = useMemo(
    () => (showSaved && saved ? saved.fields : applyOverrides(preview.fields, draft.overrides)),
    [showSaved, saved, preview.fields, draft.overrides],
  );
  // Crisis anywhere in the story (any question, any rewrite), not just the question on screen.
  const anyCrisis = storyDraftHasCrisis(draft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [missing, setMissing] = useState(false);

  if (!visit) return <Navigate to="/visits" replace />;

  const toHelp = () => {
    update(withoutCrisisText(useDraft.getState().draft));
    navigate('/help/now', { replace: true });
  };
  /**
   * Saves what's on this page, then goes to `to`. Nothing typed: just goes (Continue asks for an answer first).
   * The server builds the summary; if it can't be reached, the same engine and guardrails run here instead.
   */
  const saveAndGo = async (to: string, { requireAnswer = false } = {}) => {
    if (crisis || anyCrisis) return toHelp();
    const current = useDraft.getState().draft;
    if (!current.opening.trim()) return requireAnswer ? setMissing(true) : navigate(to);
    // Nothing changed since it was saved: don't save a second copy.
    if (unchanged) { reset(); return navigate(to); }
    setSaving(true);
    setSaveError(null);
    const { overrides, ...engineInput } = current;
    let out = await requestPrepSummary(engineInput as StoryDraft);
    if (out.status === 'unavailable') {
      const local = translateStoryGuarded(engineInput as StoryDraft);
      out = local.status === 'blocked' ? { status: 'blocked', message: local.message } : local;
    }
    setSaving(false);
    if (out.status === 'crisis') return toHelp();
    if (out.status === 'rejected' && out.error.code === 'EMPTY_STORY') return navigate(to);
    if (out.status === 'blocked') return setSaveError(out.message);
    if (out.status === 'rejected') return setSaveError(out.error.message);
    saveSummary({ opening: current.opening.trim(), fields: applyOverrides(out.fields, overrides) });
    reset();
    navigate(to);
  };
  const next = () => saveAndGo(`/visits/${visit.id}/before/summary`, { requireAnswer: true });

  return (
    <VisitLayout visit={visit} stage="before" step="" onStepNavigate={(to) => void saveAndGo(to)}>
      <div className="b1-grid">
        <section className="panel">
          <span className="eyebrow-soft">You say</span>
          <h1 className="panel-title">{QUESTION}</h1>
          <p className="b1-hint">{HINT}</p>
          {/* Always shown, on every browser and device. Where speech input isn't available yet,
              the button just moves the cursor to the text box. */}
          <div className="talk-row">
            {supported
              ? <button {...toggleProps} className={`talk talk--record${listening ? ' listening' : ''}`}>{listening ? 'Stop' : 'Record'}</button>
              : <button type="button" className="talk talk--record" onClick={() => document.getElementById('say')?.focus()}>Record</button>}
            <span className="muted">
              {listening ? 'Listening… press Stop when you’re done' : <>Press to talk/stop, or type below <span className="req" aria-hidden="true">*</span></>}
            </span>
          </div>
          <label htmlFor="say" className="sr-only">Your words (required)</label>
          <textarea id="say" className="textarea" aria-required="true" aria-invalid={missing} aria-describedby={missing ? 'say-missing' : undefined} value={text} onChange={(e) => { update({ opening: e.target.value }); if (missing) setMissing(false); }}
            placeholder="Most days I…" />

          {crisis && (
            <div className="pcard pcard--crisis" role="alert" style={{ padding: 16 }}>
              <strong>It sounds like things are really hard right now.</strong>
              <p className="small" style={{ margin: 0 }}>You don’t have to carry this alone. Talking to someone can help, right now.</p>
              <Link to="/help-now" className="btn btn--sm btn--danger" style={{ alignSelf: 'flex-start' }}>Talk to someone now</Link>
            </div>
          )}

          {missing && <p id="say-missing" className="form-error" role="alert">Type or record an answer to continue.</p>}
          {saveError && <p className="note" role="alert">{saveError}</p>}
          {latest && !draft.opening && (
            <p className="small muted">Your last story was saved {formatDate(toISODate(new Date(latest.createdAt)))}. Telling it again adds an update.</p>
          )}
        </section>

        <section className="panel panel--accent" aria-labelledby="reads">
          <span id="reads" className="eyebrow-soft">Your doctor reads · updates as you go</span>
          {!showSaved && preview.status === 'loading' && <p className="note" role="status">Updating…</p>}
          {!showSaved && (preview.status === 'unavailable' || preview.status === 'blocked') && <p className="note" role="status">{preview.message}</p>}
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
      <div className="b1-footer">
        <span className="small"><span className="req" aria-hidden="true">*</span> required</span>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => void next()} disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
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
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!visit) return <Navigate to="/visits" replace />;
  const base = `/visits/${visit.id}/before`;
  // Only what was shared in Name how I feel for this visit.
  const latest = selectVisitSummary(state, visit);

  // Empty state: nothing shared in Name how I feel for this visit yet.
  if (!latest) {
    return (
      <VisitLayout visit={visit} stage="before" step="summary">
        <section className="panel panel--accent b3-panel" aria-labelledby="b3-title">
          <h1 id="b3-title" className="panel-title">Notes for your doctor</h1>
          <p className="muted" style={{ margin: 0 }}>Nothing here yet. These notes fill in from what you share in Name how I feel.</p>
          <div className="two-col two-col--plain">
            <div className="kv">
              <span className="eyebrow-soft">Symptoms</span>
              <span className="muted">[—]</span>
            </div>
            <div className="stack">
              <div className="kv"><span className="eyebrow-soft">Treatment so far</span><span className="muted">[—]</span></div>
              <div className="kv"><span className="eyebrow-soft">What others have noticed</span><span className="muted">[—]</span></div>
            </div>
          </div>
        </section>
        <div className="b1-footer">
          <span className="spacer" />
          <Link to={base} className="btn btn--outline">Go to Name how I feel</Link>
          <Link to={`${base}/brief`} className="btn btn--primary">Continue</Link>
        </div>
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

  const noticed = visit.othersNoticed?.trim();

  const startEdit = () => {
    setVals({
      ...Object.fromEntries(latest.fields.map((f) => [f.key, f.clinical === 'Not discussed' ? '' : f.clinical])),
      noticed: visit.othersNoticed ?? '',
    });
    setEditing(true);
  };
  const saveEdit = () => {
    if (Object.values(vals).some((v) => hasCrisisLanguage(v))) { navigate('/help/now'); return; }
    const fields = latest.fields.map((f) => {
      const v = vals[f.key]?.trim() ?? '';
      const before = f.clinical === 'Not discussed' ? '' : f.clinical;
      return v === before ? f : { ...f, clinical: v || 'Not discussed', editedByPatient: true };
    });
    if (fields.some((f, i) => f !== latest.fields[i])) state.saveSummary({ opening: latest.opening, fields });
    const n = vals.noticed?.trim() ?? '';
    if (n !== (visit.othersNoticed ?? '')) state.updateVisit(visit.id, { othersNoticed: n || undefined });
    setEditing(false);
  };

  return (
    <VisitLayout visit={visit} stage="before" step="summary">
      <section className="panel panel--accent b3-panel" aria-labelledby="b3-title">
        <div className="row row--between row--wrap">
          <h1 id="b3-title" className="panel-title">Notes for your doctor</h1>
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
            <div className="field">
              <label htmlFor="sum-noticed">What others have noticed</label>
              <textarea id="sum-noticed" className="textarea" style={{ minHeight: 56 }} value={vals.noticed ?? ''}
                placeholder="e.g. My partner says I’ve been sleeping more."
                onChange={(e) => setVals({ ...vals, noticed: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="two-col two-col--plain">
            <div className="kv">
              <span className="eyebrow-soft">Symptoms</span>
              {latest.opening && (
                <div className="kv__row"><span><strong>In your words:</strong> “{latest.opening}”</span></div>
              )}
              {SUMMARY_ROWS.map((r) => show(r.key) && (
                <div className="kv__row" key={r.key}>
                  <span><strong>{r.label}:</strong> {show(r.key)}</span>
                  {field(r.key)?.editedByPatient && <span className="small muted">Your wording</span>}
                </div>
              ))}
              {!latest.opening && !SUMMARY_ROWS.some((r) => show(r.key)) && <span className="muted">Not discussed</span>}
            </div>
            <div className="stack">
              <div className="kv">
                <span className="eyebrow-soft">Treatment so far</span>
                {tried ? <span>{tried}</span> : <span className="muted">Not discussed</span>}
              </div>
              <div className="kv">
                <span className="eyebrow-soft">What others have noticed</span>
                {noticed ? <span>{noticed}</span> : <span className="muted">Nothing added yet. Tap Edit to add it.</span>}
              </div>
            </div>
          </div>
        )}
        <p className="note">Built from your words in Name how I feel. Patient-reported.</p>
      </section>
      <div className="b1-footer">
        <span className="spacer" />
        {editing ? (
          <>
            <button className="btn btn--outline" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn--primary" onClick={saveEdit}>Save changes</button>
          </>
        ) : (
          <>
            <button className="btn btn--outline" onClick={startEdit}>Edit</button>
            <Link to={`${base}/brief`} className="btn btn--primary">Continue</Link>
          </>
        )}
      </div>
    </VisitLayout>
  );
}

/* ======================================================================
   B4 · Talking points + tips to bring
   ====================================================================== */

export function TalkingPointsStep() {
  const visit = useVisitParam();
  const state = useApp();
  if (!visit) return <Navigate to="/visits" replace />;
  const latest = selectVisitSummary(state, visit);
  const update = (patch: Partial<Visit>) => state.updateVisit(visit.id, patch);
  const attached = visit.scripts ?? [];
  const suggested = [...new Set([...attached, ...draftPlaybook(state).scriptIds, ...state.savedScripts])].slice(0, 6);

  return (
    <VisitLayout visit={visit} stage="before" step="brief">
      <div className="b4-grid">
        <section className="panel" aria-labelledby="b4-title">
          <div className="row row--between b4-head">
            <h1 id="b4-title" className="panel-title">Your appointment talking points</h1>
            {visit.priorities.length > 0 && <span className="pill pill--amber">Ready for your visit</span>}
          </div>
          <p className="muted" style={{ margin: 0 }}>Your visit goes fast. Drag to put what matters most first.</p>
          {/* Suggested questions from the patient's goal + history come first (ADR-012), then symptoms from the story. */}
          <Priorities
            visit={visit}
            update={update}
            suggestions={[
              ...suggestQuestions(state, visit, todayISO()).map((q) => q.text),
              ...suggestionsFrom(latest?.fields.find((f) => f.key === 'symptoms')?.clinical),
            ]}
            bare
            addLink
          />
        </section>
        <div className="b4-side">
          <section className="panel" aria-labelledby="b4-helped">
            <span id="b4-helped" className="eyebrow-soft">What helped others</span>
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
          </section>
          <div className="b1-footer" style={{ marginTop: 0 }}>
            <span className="spacer" />
            <Link to={`/visits/${visit.id}/before/today`} className="btn btn--primary">Continue</Link>
          </div>
        </div>
      </div>
    </VisitLayout>
  );
}

/* ======================================================================
   B5 · Prep — feeling, editable checklist, breathing
   ====================================================================== */

/** How are you feeling right now? Pick any that fit. */
const FEELINGS = ['Calm', 'Nervous', 'Overwhelmed', 'Hopeful', 'Frustrated', 'Scared', 'Normal'];
const DEFAULT_CHECKS = ['Read my appointment talking points', 'Pick one tip to keep handy', 'Bring ID, med list, charged phone'];
/** Earlier names of the default items, so ticks saved before the rename still count. */
const OLD_CHECK_NAMES: Record<string, string[]> = {
  'Read my appointment talking points': ['Read my talking points', 'Read my top 3 talking points'],
  'Pick one tip to keep handy': ['Pick one playbook to keep handy'],
  'Bring ID, med list, charged phone': ['Bring ID, med list, phone charged'],
};

export function PrepStep() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const updateVisit = useApp((s) => s.updateVisit);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [addingFeeling, setAddingFeeling] = useState(false);
  const [newFeelings, setNewFeelings] = useState('');
  if (!visit) return <Navigate to="/visits" replace />;
  const prep = visit.prep ?? { checks: [], extra: [] };
  const feelings = prepFeelings(prep);
  // Store the list; drop the old single value so the two never disagree.
  const setFeelings = (next: string[]) => set({ feelings: next, feeling: undefined });
  const set = (patch: Partial<typeof prep>) => updateVisit(visit.id, { prep: { ...prep, ...patch } });
  const items = [...DEFAULT_CHECKS, ...prep.extra];
  const names = (item: string) => [item, ...(OLD_CHECK_NAMES[item] ?? [])];
  const isChecked = (item: string) => names(item).some((n) => prep.checks.includes(n));
  const toggle = (item: string, on: boolean) => {
    const rest = prep.checks.filter((c) => !names(item).includes(c));
    set({ checks: on ? [...rest, item] : rest });
  };
  // Feelings saved before this list changed stay visible, so they can be unpicked.
  const feelingOptions = [...new Set([...FEELINGS, ...feelings])];
  const when = visit.date === todayISO() ? `Today${visit.time ? `, ${formatTime(visit.time)}` : ''}` : visit.time ? formatTime(visit.time) : undefined;

  /** "Tired, restless" adds two feelings. Duplicates (any case) are skipped. */
  const addFeelings = () => {
    const typed = newFeelings.split(',').map((f) => f.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean)
      .map((f) => f.charAt(0).toUpperCase() + f.slice(1));
    if (!typed.length) return;
    if (typed.some((f) => hasCrisisLanguage(f))) { navigate('/help/now'); return; }
    const have = new Set(feelings.map((f) => f.toLowerCase()));
    const fresh: string[] = [];
    typed.forEach((f) => {
      const match = FEELINGS.find((o) => o.toLowerCase() === f.toLowerCase()) ?? f;
      if (!have.has(match.toLowerCase())) { have.add(match.toLowerCase()); fresh.push(match); }
    });
    setFeelings([...feelings, ...fresh]);
    setNewFeelings('');
    setAddingFeeling(false);
  };
  const closeFeelings = () => { setNewFeelings(''); setAddingFeeling(false); };

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
      <p className="muted" style={{ marginTop: -6 }}>Feel free to check in with yourself, or skip these questions.</p>
      <section className="panel">
        <span className="eyebrow-soft">How are you feeling right now?</span>
        <ChipMulti label="How are you feeling" options={feelingOptions} value={feelings} onChange={setFeelings} />
        {addingFeeling ? (
          <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); addFeelings(); }}>
            <label htmlFor="own-feeling" className="sr-only">Add your own feelings</label>
            <div className="row">
              <input id="own-feeling" className="input" autoFocus value={newFeelings} aria-describedby="own-feeling-hint"
                placeholder="e.g. Tired, restless, relieved" onChange={(e) => setNewFeelings(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') closeFeelings(); }} />
              <button className="btn btn--sm" type="submit" disabled={!newFeelings.trim()}>Add</button>
              <button type="button" className="link-btn" onClick={closeFeelings}>Cancel</button>
            </div>
            <span id="own-feeling-hint" className="small muted">You can add more than one. Separate them with commas.</span>
          </form>
        ) : (
          <button type="button" className="link-btn priority-add" onClick={() => setAddingFeeling(true)}>+ Add your own</button>
        )}
      </section>
      <div className="b5-grid">
        <section className="panel">
          <span className="eyebrow-soft">Before you go checklist</span>
          <div className="checklist">
            {items.map((item) => (
              <div key={item} className="checklist__row">
                <Checkbox checked={isChecked(item)} onChange={(on) => toggle(item, on)}>{item}</Checkbox>
                {prep.extra.includes(item) && (
                  <button className="icon-btn" aria-label={`Remove "${item}"`} onClick={() => set({ extra: prep.extra.filter((x) => x !== item), checks: prep.checks.filter((c) => c !== item) })}>×</button>
                )}
              </div>
            ))}
          </div>
          {adding ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <label htmlFor="own" className="sr-only">Add your own</label>
              <input id="own" className="input" autoFocus value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="e.g. Write down my questions"
                onKeyDown={(e) => { if (e.key === 'Escape') { setNewItem(''); setAdding(false); } }} />
              <button className="btn btn--sm" type="submit" disabled={!newItem.trim()}>Add</button>
              <button type="button" className="link-btn" onClick={() => { setNewItem(''); setAdding(false); }}>Cancel</button>
            </form>
          ) : (
            <button className="link-btn priority-add" onClick={() => setAdding(true)}>+ Add your own</button>
          )}
        </section>
        <BreathingPanel />
      </div>
      <div className="b1-footer">
        <span className="spacer" />
        <Link to={`/visits/${visit.id}/before/share`} className="btn btn--primary">Continue</Link>
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
      <span className="eyebrow-soft">Prep · breathing to help you feel calm before the visit</span>
      <p style={{ margin: 0 }}>Follow the circle — breathe in, hold, out.</p>
      <div className="breath-ring" aria-live="polite" style={{ transform: `scale(${scale})`, transitionDuration: phase === 'in' ? '4s' : phase === 'out' ? '6s' : '0.3s' }}>
        {phase === 'idle' ? 'Breathe in' : phase === 'done' ? 'Done' : phase === 'in' ? 'Breathe in' : phase === 'hold' ? 'Hold' : 'Breathe out'}
      </div>
      <span className="small muted">{running && !done ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'Inhale 4 · Hold · Exhale 6'}</span>
      <div className="chips" role="group" aria-label="How long">
        {[1, 3, 5].map((m) => <Chip key={m} selected={minutes === m} onClick={() => { setMinutes(m); setRunning(false); setElapsed(0); }}>{m} min</Chip>)}
      </div>
      <button className="btn btn--outline btn--sm breath-start" onClick={() => { if (running && !done) { setRunning(false); } else { setElapsed(0); setRunning(true); } }}>
        {running && !done ? 'Stop' : done ? 'Again' : 'Start'}
      </button>
    </section>
  );
}

/* ======================================================================
   B6 · Export PDF / share link (dialog)
   ====================================================================== */

/** Counted from the visit date. */
const EXPIRY = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

export function ShareStep() {
  const visit = useVisitParam();
  const navigate = useNavigate();
  const state = useApp();
  const [open, setOpen] = useState(true);
  const [tp, setTp] = useState(true);
  const [sum, setSum] = useState(true);
  const [days, setDays] = useState(30);
  const [made, setMade] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, showToast] = useToast();
  if (!visit) return <Navigate to="/visits" replace />;
  const active = (state.shareLinks ?? []).filter((l) => isLinkActive(l));

  const create = async () => {
    // The countdown starts on the visit date (or today, if the visit has passed).
    const l = state.createShareLink(buildBriefSnapshot(state, visit, { talkingPoints: tp, summary: sum, caseHistory: false }), days, parseISO(visit.date));
    state.updateVisit(visit.id, { shared: true });
    setMade(l);
    setCopied(false);
    setEmails('');
    setEmailMsg(null);
  };
  const copy = async (l: ShareLink) => {
    try { await navigator.clipboard.writeText(linkUrl(l)); setCopied(true); } catch { setCopied(false); showToast('Couldn’t copy. Select the link and copy it.'); }
  };
  /** Opens the person's own email app with the link filled in. Nothing is sent by us. */
  const sendEmail = () => {
    if (!made) return;
    const list = emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!list.length) return setEmailMsg({ ok: false, text: 'Enter at least one email address.' });
    const bad = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad.length) return setEmailMsg({ ok: false, text: `Check ${bad.length === 1 ? 'this address' : 'these addresses'}: ${bad.join(', ')}` });
    const draft = shareEmailDraft({ recipient: { name: '', role: '', email: list.join(',') }, url: linkUrl(made), expiresAt: made.expiresAt, patientName: state.profile?.name });
    window.location.href = draft.mailto;
    setEmailMsg({ ok: true, text: 'Your email app should open with the message ready to send.' });
  };
  const close = () => { setOpen(false); setMade(null); setCopied(false); setEmails(''); setEmailMsg(null); };
  const pdf = () => {
    state.updateVisit(visit.id, { shared: true });
    navigate(`/visits/${visit.id}/at/room?print=1&tp=${tp ? 1 : 0}&sum=${sum ? 1 : 0}&hist=0`);
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
        <Modal title={made ? 'Your link is ready' : 'Share your summary'} onClose={close} closeButton>
          {made ? (
            <>
              <p className="muted" style={{ margin: 0 }}>Anyone with the link can view your summary until it expires.</p>
              <div className="row share-ready__row">
                <label htmlFor="ready-link" className="sr-only">Your link</label>
                <input id="ready-link" className="input" readOnly value={linkUrl(made)} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn btn--primary" onClick={() => void copy(made)}>Copy link</button>
              </div>
              {copied && (
                <p className="share-ready__copied" role="status">
                  <span aria-hidden="true">✓</span> Link copied. Paste it in a text, patient portal message or email.
                </p>
              )}
              <h3 className="share-ready__heading">Or send it by email</h3>
              <div className="row share-ready__row">
                <label htmlFor="ready-emails" className="sr-only">Email addresses, separated by commas</label>
                <input id="ready-emails" className="input" type="text" inputMode="email" autoComplete="off" value={emails}
                  placeholder="doctor@clinic.com, me@email.com" onChange={(e) => { setEmails(e.target.value); setEmailMsg(null); }}
                  aria-invalid={emailMsg ? !emailMsg.ok : undefined} aria-describedby={emailMsg ? 'ready-email-msg' : undefined} />
                <button className="btn btn--outline" onClick={sendEmail}>Send email</button>
              </div>
              {emailMsg && <p id="ready-email-msg" className={emailMsg.ok ? 'small muted' : 'form-error'} role={emailMsg.ok ? 'status' : 'alert'} style={{ margin: 0 }}>{emailMsg.text}</p>}
              <p className="small muted" style={{ margin: 0 }}>
                Anyone with the link can view it until it expires. You can stop sharing anytime in <Link to="/settings/privacy">Settings</Link>.
              </p>
              <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn--primary" onClick={close}>Done</button>
              </div>
            </>
          ) : (
          <>
          <span className="eyebrow-soft">Include</span>
          <div className="checklist">
            <div className="checklist__row"><Checkbox checked={tp} onChange={setTp}>Appointment talking points</Checkbox></div>
            <div className="checklist__row"><Checkbox checked={sum} onChange={setSum}>Notes for your doctor</Checkbox></div>
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
            <span className="small muted">
              {visit.date > todayISO() ? `Counts from your visit date (${formatShort(visit.date)}).` : 'Counts from today.'}{' '}
              The link ends {formatDate(addDays(visit.date > todayISO() ? visit.date : todayISO(), days))}.
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Anyone with the link can view it until it expires. You can stop sharing anytime in <Link to="/settings/privacy">Settings</Link>.
            For now links open only on this device, because nothing is uploaded yet.
          </p>
          </>
          )}
        </Modal>
      )}
      {toast}
    </VisitLayout>
  );
}
