import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { CRISIS_MESSAGE, CRISIS_RESOURCES, CRISIS_SHORT } from '../lib/guardrails/copy';
import { useApp } from '../lib/store';

/**
 * Crisis support (PRD F6/J5, ticket B3). Shown from the help link on every page, and automatically
 * when crisis language is detected (detected = true).
 *
 * Copy: Copy Drafts §3 crisis-response message, kept in src/lib/guardrails/copy.ts. It routes only to
 * peer support that won't contact police or emergency services without consent. Draft — needs mentor
 * sign-off; open decision on an opt-in, user-initiated emergency option (see ADR-004).
 */
export function Help({ detected = false }: { detected?: boolean }) {
  const signedIn = useApp((s) => !!s.profile?.onboarded);
  return (
    <Shell header={{ kind: 'sub', title: 'Support', back: 'history', right: <span /> }}>
      {detected ? (
        <>
          <h1>{CRISIS_MESSAGE.title}</h1>
          <p className="lead">{CRISIS_MESSAGE.intro}</p>
          <p className="small muted">We paused here. What you just wrote was not saved.</p>
        </>
      ) : (
        <>
          <h1>{CRISIS_SHORT.lead}</h1>
          <p className="lead">These people won’t call the police or send anyone unless you ask them to.</p>
        </>
      )}

      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {CRISIS_RESOURCES.map((r) => (
          <li key={r.name} className="card card--soft">
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>{r.name}</h2>
            <p>{r.note}</p>
            {r.tel && (
              <a className="btn btn--primary" href={`tel:${r.tel}`} aria-label={`Call ${r.name} at ${r.phone}`}>
                Call {r.phone}
              </a>
            )}
            {r.url && (
              <a className="btn" href={r.url} target="_blank" rel="noreferrer">
                {r.urlLabel}
              </a>
            )}
          </li>
        ))}
      </ul>

      {detected && <p>{CRISIS_MESSAGE.closing}</p>}

      <Link to={signedIn ? '/home' : '/'} className="btn btn--ghost btn--block">Back to {signedIn ? 'Home' : 'start'}</Link>
    </Shell>
  );
}
