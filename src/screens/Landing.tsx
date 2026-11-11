import { Link, useNavigate } from 'react-router-dom';
import { HeroArt } from '../components/Art';
import { PublicLayout } from '../components/PublicLayout';
import { useOnboarding } from '../lib/onboarding';
import { useApp } from '../lib/store';

/** P1 · Landing page — promise first, then the three-stage loop. */
export function Landing() {
  const loadDemo = useApp((s) => s.loadDemo);
  const navigate = useNavigate();
  const resumeStep = useOnboarding((s) => s.step);

  return (
    <PublicLayout>
      <main id="main" className="pub-main">
        <section className="hero-grid">
          <div className="hero-copy">
            <span className="pill pill--amber">Free for patients, always</span>
            <h1 className="hero">Walk in and be taken seriously.</h1>
            <p className="pub-lead">
              Tell us how you feel. We’ll help your doctor understand. Built for people living with depression and anxiety.
            </p>
            <div className="btn-row">
              {resumeStep > 1 ? (
                <Link to="/welcome" className="btn btn--primary btn--lg">Continue setting up</Link>
              ) : (
                <Link to="/signup" className="btn btn--primary btn--lg">Get started free</Link>
              )}
              <Link to="/how-it-works" className="btn btn--outline btn--lg">See how it works</Link>
            </div>
            <p className="small muted">Private by design. We never sell your data.</p>
          </div>
          <div className="art hero-art"><HeroArt /></div>
        </section>

        <section className="cols-3" aria-label="How it helps">
          <div className="pcard">
            <span className="eyebrow">Before</span>
            <p><strong>Tell it your way.</strong> Talk or type. We put it in words your doctor understands.</p>
          </div>
          <div className="pcard">
            <span className="eyebrow">At the visit</span>
            <p><strong>Show, don’t scramble.</strong> A one-page brief and help in the moment.</p>
          </div>
          <div className="pcard">
            <span className="eyebrow">After</span>
            <p><strong>Know what’s next.</strong> A clear summary and follow-up reminders.</p>
          </div>
        </section>

        <button
          className="btn btn--link small"
          style={{ alignSelf: 'center', color: 'var(--ink-muted)' }}
          onClick={() => { loadDemo(); navigate('/home'); }}
        >
          Explore with demo data (Theo, synthetic) →
        </button>
      </main>
    </PublicLayout>
  );
}
