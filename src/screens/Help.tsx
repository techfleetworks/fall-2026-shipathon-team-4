import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useApp } from '../lib/store';

/**
 * Crisis resources (PRD F6/J5). Shown from the 988 link on every page, and
 * automatically when crisis language is detected (state.detected = true).
 * Calm, short, no counselling.
 */
export function Help({ detected = false }: { detected?: boolean }) {
  const signedIn = useApp((s) => !!s.profile?.onboarded);
  return (
    <Shell header={{ kind: 'sub', title: 'Help now', back: 'history', right: <span /> }}>
      {detected ? (
        <>
          <h1>You don’t have to go through this alone.</h1>
          <p className="lead">
            It sounds like things might be really hard right now. People are ready to talk with you, any time, for free.
          </p>
          <p className="small muted">We paused here. What you just wrote was not saved.</p>
        </>
      ) : (
        <>
          <h1>Need help now?</h1>
          <p className="lead">Free, confidential support, 24/7 in the US.</p>
        </>
      )}

      <div className="card card--danger">
        <h2>988 Suicide &amp; Crisis Lifeline</h2>
        <div className="grid-2">
          <a className="btn btn--danger" href="tel:988">Call 988</a>
          <a className="btn" href="sms:988">Text 988</a>
        </div>
        <a className="small" href="https://988lifeline.org/chat/" target="_blank" rel="noreferrer">Or chat online at 988lifeline.org</a>
      </div>

      <div className="card card--soft">
        <h3>Crisis Text Line</h3>
        <p>Text <strong>HOME</strong> to <strong>741741</strong>.</p>
        <a className="btn btn--sm" href="sms:741741?body=HOME">Open messages</a>
      </div>

      <div className="card card--soft">
        <h3>In immediate danger?</h3>
        <p>Call 911 or go to the nearest emergency room.</p>
        <a className="btn btn--sm" href="tel:911">Call 911</a>
      </div>

      <Link to={signedIn ? '/home' : '/'} className="btn btn--ghost btn--block">Back to {signedIn ? 'Home' : 'start'}</Link>
    </Shell>
  );
}
