import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { IconTrash } from '../components/Icons';
import { Disclaimer, useToast } from '../components/ui';
import { formatDate, todayISO } from '../lib/dates';
import { hasCrisisLanguage } from '../lib/safety';
import { caseAsText, shareText } from '../lib/share';
import { selectLatestSummary, useApp } from '../lib/store';
import type { EvidenceType } from '../lib/types';

export function MyCase() {
  const state = useApp();
  const latest = selectLatestSummary(state);
  const [toast, showToast] = useToast();
  const openFollowUp = state.followUps.filter((f) => !f.outcome).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const evidence = [...state.evidence].sort((a, b) => b.date.localeCompare(a.date));
  const field = (k: string) => latest?.fields.find((f) => f.key === k);

  return (
    <Shell
      header={{ kind: 'sub', title: 'My case', back: '/home', backLabel: 'Home', right: <Link to="/case/add" className="header-link">+ Add</Link> }}
      tabs
    >
      <section className="card" aria-labelledby="sum">
        <h3 id="sum">Doctor - ready summary</h3>
        {latest ? (
          <div className="kv">
            {['symptoms', 'onset', 'frequency', 'severity', 'tried'].map((k) => {
              const f = field(k);
              if (!f) return null;
              return (
                <div className="kv__row" key={k}>
                  <span><strong>{f.label}:</strong> <span className={f.clinical === 'Not discussed' ? 'muted' : undefined}>{f.clinical}</span></span>
                </div>
              );
            })}
            <div className="kv__row">
              <span>
                <strong>Open next step:</strong>{' '}
                {openFollowUp ? `${openFollowUp.step}, due ${formatDate(openFollowUp.dueDate)}` : <span className="muted">None open</span>}
              </span>
            </div>
          </div>
        ) : (
          <>
            <p className="muted">Nothing here yet. Tell your story and we’ll build it with you.</p>
            <Link to="/story" className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-start' }}>Tell my story</Link>
          </>
        )}
        {latest && <Disclaimer />}
      </section>

      <h2 className="section-label">Evidence (newest first)</h2>
      {evidence.length === 0 && <p className="muted small">Visits, medications and saved stories will show up here with their dates.</p>}
      <div className="timeline">
        {evidence.map((e) => (
          <div className="card card--soft" key={e.id}>
            <div className="row row--between">
              <span className="card__title">{formatDate(e.date)} · {e.title}</span>
              <button
                className="icon-btn no-print"
                aria-label={`Delete ${e.title} from ${formatDate(e.date)}`}
                onClick={() => { if (confirm('Delete this entry for good?')) state.deleteEvidence(e.id); }}
              >
                <IconTrash width={16} height={16} />
              </button>
            </div>
            <span>{e.detail}</span>
          </div>
        ))}
      </div>

      <section className="card no-print">
        <h3>Share My Case</h3>
        <button className="btn btn--primary btn--block" onClick={() => window.print()}>Export as PDF</button>
        <button className="btn btn--block" onClick={async () => showToast(await shareText('My case', caseAsText(state)))}>
          Share as text
        </button>
        <p className="small muted">Nothing leaves this device unless you share it. Secure links for your doctor are coming with accounts.</p>
      </section>
      {toast}
    </Shell>
  );
}

const TYPES: { value: EvidenceType | 'medication'; label: string }[] = [
  { value: 'medication', label: 'Medication change' },
  { value: 'symptom', label: 'Symptom' },
  { value: 'visit', label: 'Visit' },
  { value: 'note', label: 'Note' },
];

export function AddEvidence() {
  const navigate = useNavigate();
  const { addEvidence, addMedication } = useApp();
  const [type, setType] = useState<EvidenceType>('medication');
  const [date, setDate] = useState(todayISO());
  const [detail, setDetail] = useState('');
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');

  const canSave = type === 'medication' ? !!name.trim() : !!detail.trim();
  const save = () => {
    if (hasCrisisLanguage(detail, name)) {
      navigate('/help/now', { replace: true });
      return;
    }
    if (type === 'medication') addMedication({ name: name.trim(), dose: dose.trim(), started: date, note: detail.trim() || undefined });
    else addEvidence({ date, type, title: TYPES.find((t) => t.value === type)!.label, detail: detail.trim() });
    navigate('/case', { replace: true });
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Add to my case', back: '/case' }}>
      <h1>Add evidence</h1>
      <p className="lead">Dates make patterns visible — like a symptom that started right after a dose change.</p>
      <div className="field">
        <label htmlFor="type">What is it?</label>
        <select id="type" className="select input" value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="date">{type === 'medication' ? 'Date started or changed' : 'Date'}</label>
        <input id="date" type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </div>
      {type === 'medication' && (
        <div className="grid-2">
          <div className="field">
            <label htmlFor="mname">Medication</label>
            <input id="mname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mdose">Dose</label>
            <input id="mdose" className="input" placeholder="e.g. 40 mg" value={dose} onChange={(e) => setDose(e.target.value)} />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="detail">{type === 'medication' ? 'Note (optional)' : 'What happened?'}</label>
        <textarea id="detail" className="textarea" value={detail} onChange={(e) => setDetail(e.target.value)}
          placeholder={type === 'medication' ? 'e.g. dose increased' : 'e.g. Side effect noted: dizzy when standing'} />
      </div>
      <button className="btn btn--primary btn--block" disabled={!canSave} onClick={save}>Save to my case</button>
    </Shell>
  );
}
