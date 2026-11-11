import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { todayISO } from '../lib/dates';
import { hasCrisisLanguage } from '../lib/safety';
import { useApp } from '../lib/store';
import type { EvidenceType } from '../lib/types';

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
    navigate('/visits/history', { replace: true });
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Add to history', back: '/visits/history' }}>
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
      <button className="btn btn--primary btn--block" disabled={!canSave} onClick={save}>Save to my history</button>
    </Shell>
  );
}
