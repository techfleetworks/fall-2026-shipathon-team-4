import { Link, useNavigate } from 'react-router-dom';
import { PublicLayout } from '../components/PublicLayout';
import { selectSignedIn, useApp } from '../lib/store';

/**
 * P5 · Crisis help (988). Reachable from every page, logged in or not.
 * Calm layout, no clutter, terracotta only here. Also shown automatically when
 * crisis language is detected (`detected`) — that text is never saved.
 * Verify all crisis details before launch.
 */
export function Help({ detected = false }: { detected?: boolean }) {
  const navigate = useNavigate();
  const signedIn = useApp(selectSignedIn);
  const back = () => {
    if (!detected && window.history.state?.idx > 0) navigate(-1);
    else navigate(signedIn ? '/home' : '/');
  };

  return (
    <PublicLayout header="back" footer={false} onBack={back}>
      <main id="main" className="crisis">
        <h1>{detected ? 'You don’t have to go through this alone.' : 'You’re not alone. Help is here now.'}</h1>
        {detected && (
          <p className="pub-sub">
            It sounds like things might be really hard right now. People are ready to talk with you, any time, for free.
            We paused here — what you just wrote was not saved.
          </p>
        )}

        <section className="pcard pcard--crisis" aria-labelledby="c988">
          <h2 id="c988">Call or text 988</h2>
          <p>Free, confidential support, 24/7 (Suicide &amp; Crisis Lifeline, US).</p>
          <div className="btn-row">
            <a className="btn btn--danger" href="tel:988">Call 988</a>
            <a className="btn btn--outline-danger" href="sms:988">Text 988</a>
            <a className="btn btn--outline-danger" href="https://988lifeline.org/chat/" target="_blank" rel="noreferrer">Chat online</a>
          </div>
        </section>

        <section className="pcard">
          <h2>In immediate danger?</h2>
          <p>Call <a href="tel:911">911</a> or go to the nearest emergency room.</p>
        </section>

        <section className="pcard pcard--muted">
          <h2>Need a moment first?</h2>
          <p>Try 60 seconds of slow breathing.</p>
          <Link to="/breathe" className="btn btn--outline" style={{ alignSelf: 'flex-start' }}>Start breathing</Link>
        </section>
      </main>
    </PublicLayout>
  );
}
