import { Link, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useApp } from '../lib/store';

export function Landing() {
  const loadDemo = useApp((s) => s.loadDemo);
  const navigate = useNavigate();

  return (
    <Shell header={{ kind: 'brand' }}>
      <div className="illustration" aria-hidden="true">
        <svg viewBox="0 0 240 120" width="100%" style={{ maxWidth: 280 }}>
          <rect x="18" y="20" width="120" height="58" rx="14" fill="#fff" stroke="#5a6172" strokeWidth="2" />
          <path d="M40 78 l-8 18 l24 -18" fill="#fff" stroke="#5a6172" strokeWidth="2" strokeLinejoin="round" />
          <rect x="34" y="36" width="70" height="7" rx="3.5" fill="#ddd7cb" />
          <rect x="34" y="52" width="88" height="7" rx="3.5" fill="#ddd7cb" />
          <rect x="112" y="44" width="110" height="52" rx="14" fill="#1f6b63" />
          <path d="M196 96 l10 16 l-26 -16" fill="#1f6b63" />
          <rect x="128" y="58" width="78" height="7" rx="3.5" fill="#e2efed" />
          <rect x="128" y="74" width="54" height="7" rx="3.5" fill="#e2efed" />
        </svg>
      </div>

      <h1>Walk in and be taken seriously.</h1>
      <p className="lead">“Tell us how you feel. We’ll help your doctor understand.”</p>

      <div className="card card--soft">
        <ul className="list">
          <li>Tell your story in your own words</li>
          <li>Get a one-page brief for your visit</li>
          <li>Learn what worked for people like you</li>
        </ul>
      </div>

      <div className="card card--muted">
        <h3>Our promise</h3>
        <p>Free for you, always. We never sell your data.</p>
        <p>You control who sees what, and you can delete everything anytime.</p>
        <p className="small muted">This version keeps everything on this device only.</p>
      </div>

      <Link to="/welcome" className="btn btn--primary btn--block">Get Started</Link>
      <Link to="/caregiver" className="btn btn--link" style={{ alignSelf: 'center' }}>I’m supporting someone →</Link>

      <div className="divider" />
      <button
        className="btn btn--ghost btn--sm"
        style={{ alignSelf: 'center' }}
        onClick={() => { loadDemo(); navigate('/home'); }}
      >
        Explore with demo data (Theo, synthetic)
      </button>
    </Shell>
  );
}
