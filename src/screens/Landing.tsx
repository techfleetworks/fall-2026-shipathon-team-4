import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicLayout } from '../components/PublicLayout';
import { startDemo } from '../lib/demoApi';
import { SITE } from '../lib/siteMode';
import { useOnboarding } from '../lib/onboarding';
import { useApp } from '../lib/store';

/** P1 · Landing page — promise first, then the three-stage loop. */
export function Landing() {
  const loadDemo = useApp((s) => s.loadDemo);
  const navigate = useNavigate();
  const resumeStep = useOnboarding((s) => s.step);
  const [loadingDemo, setLoadingDemo] = useState(false);

  return (
    <PublicLayout>
      <main id="main" className="pub-main">
        <section className="hero-grid">
          <div className="hero-copy">
            <span className="pill pill--amber">Free for patients</span>
            <h1 className="hero">Be heard and be taken seriously.</h1>
            <p className="pub-lead">
              Tell us how you feel. We’ll help your doctor understand.<br />
              Built for people living with mood disorders.
            </p>
            <div className="btn-row">
              {resumeStep > 1 ? (
                <Link to="/welcome" className="btn btn--primary btn--lg">Continue setting up</Link>
              ) : (
                <Link to="/signup" className="btn btn--primary btn--lg">Sign up free</Link>
              )}
              <Link to="/how-it-works" className="btn btn--outline btn--lg">See how it works</Link>
            </div>
            <p className="small muted">Private by design. We never sell your data.</p>
          </div>
          <div className="art hero-art">
            <figure className="translate-card">
              <figcaption className="small muted">Your words, in your doctor’s language</figcaption>
              <div className="translate-cols">
                <div>
                  <span className="translate-label">You say</span>
                  <p className="translate-box translate-box--you">“I can’t get out of bed and nothing feels worth it anymore.”</p>
                </div>
                <span className="translate-arrow" aria-hidden="true">→</span>
                <div>
                  <span className="translate-label">Your doctor reads</span>
                  <p className="translate-box translate-box--doc">Low mood with loss of interest, ~2 weeks, affecting daily function. Safety check advised.</p>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section className="cols-3" aria-label="How it helps">
          <div className="pcard">
            <span className="eyebrow">Before the visit</span>
            <p><strong>Tell it your way.</strong> Talk or type. We put it in words your doctor understands.</p>
          </div>
          <div className="pcard">
            <span className="eyebrow">At the visit</span>
            <p><strong>Be clear, not confused.</strong> A doctor summary and help in the moment.</p>
          </div>
          <div className="pcard">
            <span className="eyebrow">After the visit</span>
            <p><strong>Know what’s next.</strong> An after-visit recap and to-do list with follow-up reminders.</p>
          </div>
        </section>

        {/* Demo site (ADR-016): Theo's login, shown on purpose so visitors can log in and out as Theo. */}
        {SITE.mode === 'demo' && SITE.demoLogin && (
          <section className="pcard pcard--muted" aria-labelledby="try-theo" style={{ alignSelf: 'center', maxWidth: 520 }}>
            <span className="eyebrow">Try it as Theo</span>
            <p id="try-theo" style={{ margin: 0 }}>Log in as Theo, a made-up patient, to see how the app works with real-looking information.</p>
            <p className="small" style={{ margin: 0 }}>
              Email: <strong>{SITE.demoLogin.email}</strong><br />Password: <strong>{SITE.demoLogin.password}</strong>
            </p>
            <Link className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-start' }} to="/login?as=theo">Log in as Theo</Link>
            <span className="small muted">Synthetic — illustrative only, not medical advice.</span>
          </section>
        )}

        {/* Real users' site (ADR-016): the demo lives on its own site, so a real user's data is never touched. */}
        {SITE.mode === 'live' && SITE.demoUrl ? (
          <a className="btn btn--link small" style={{ alignSelf: 'center', color: 'var(--ink-muted)' }} href={SITE.demoUrl} target="_blank" rel="noopener noreferrer">
            Explore the demo (Theo, synthetic) ↗
          </a>
        ) : (
        <button
          className="btn btn--link small"
          style={{ alignSelf: 'center', color: 'var(--ink-muted)' }}
          disabled={loadingDemo}
          aria-busy={loadingDemo}
          onClick={() => {
            setLoadingDemo(true);
            // Theo from the server (the team's live record); the built-in copy if it can't be reached.
            void startDemo(loadDemo).then(() => navigate('/home'));
          }}
        >
          {loadingDemo ? 'Loading Theo’s demo…' : 'Explore with demo data (Theo, synthetic) →'}
        </button>
        )}
      </main>
    </PublicLayout>
  );
}
