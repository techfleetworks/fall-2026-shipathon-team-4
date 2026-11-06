import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ChipSelect, useToast } from '../components/ui';
import { todayISO } from '../lib/dates';
import { useApp } from '../lib/store';

const TEXT_SIZES: Record<string, number> = { Default: 1, Large: 1.15, 'Extra large': 1.3 };

export function Settings() {
  const state = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(state.profile?.name ?? '');
  const [confirming, setConfirming] = useState(false);
  const [toast, showToast] = useToast();
  const sizeLabel = Object.entries(TEXT_SIZES).find(([, v]) => v === state.textScale)?.[0] ?? 'Default';

  const download = () => {
    const { profile, medications, summaries, evidence, visits, followUps, savedScripts, sharedTips } = useApp.getState();
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), profile, medications, summaries, evidence, visits, followUps, savedScripts, sharedTips }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `get-heard-data-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Settings', back: 'history', right: <span /> }}>
      <section className="card">
        <h3>Profile</h3>
        <div className="field">
          <label htmlFor="n">Name</label>
          <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => { state.updateProfile({ name: name.trim() }); showToast('Saved'); }}>
          Save
        </button>
        <Link to="/visits" className="small">Next visit & past visits →</Link>
      </section>

      <section className="card">
        <h3>Text size</h3>
        <ChipSelect label="Text size" options={Object.keys(TEXT_SIZES)} value={sizeLabel} onChange={(v) => state.setTextScale(TEXT_SIZES[v ?? 'Default'])} />
      </section>

      <section className="card">
        <h3>Reminders</h3>
        <p className="small">Prep and follow-up reminders show on your Home screen. Phone notifications are coming with accounts.</p>
      </section>

      <section className="card">
        <h3>Privacy and data</h3>
        <p className="small">Everything is stored on this device only. Nothing is sent to us or anyone else unless you share it yourself.</p>
        <button className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={download}>Download my data</button>
        <div className="divider" />
        {!confirming ? (
          <button className="btn btn--sm" style={{ alignSelf: 'flex-start', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setConfirming(true)}>
            Delete everything
          </button>
        ) : (
          <div className="card card--danger">
            <p><strong>Delete everything on this device?</strong> Your story, case, visits and saved scripts will be permanently removed. This can’t be undone.</p>
            <div className="grid-2">
              <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn btn--danger" onClick={() => { state.deleteEverything(); navigate('/', { replace: true }); }}>Delete</button>
            </div>
          </div>
        )}
      </section>

      <section className="card card--muted">
        <h3>Demo</h3>
        <p className="small">Replace your data with Theo’s synthetic example to explore the full flow.</p>
        <button className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
          if (confirm('Replace everything on this device with demo data?')) { state.loadDemo(); navigate('/home'); }
        }}>Load demo data</button>
      </section>

      <p className="small muted">Get Heard helps you describe what you’re experiencing. It does not diagnose and does not give medical advice.</p>
      {toast}
    </Shell>
  );
}
