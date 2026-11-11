import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { CRISIS_DETECTED_RESOURCES, CRISIS_HANDOFF, HELP_HEADING, HELP_RESOURCES, type HelpResource } from '../lib/guardrails/copy';
import { useApp } from '../lib/store';

/**
 * Help (PRD F6/J5). Reachable from every page, and shown automatically when crisis language is
 * typed anywhere (detected = true); that text is never saved or folded into a brief.
 *
 * Team decision (ADR-001 update): heading "Places to start if you need help.", order warmline → 988 → 911,
 * no breathing card, 988 neutral ("for when you're in crisis", "Free, 24/7"), 911 the red emergency card.
 * When detected, a gentle handoff with 988 surfaced first. No active-rescue or police framing.
 * Content lives in src/lib/guardrails/copy.ts.
 */
export function Help({ detected = false }: { detected?: boolean }) {
  const signedIn = useApp((s) => !!s.profile?.onboarded);
  const resources = detected ? CRISIS_DETECTED_RESOURCES : HELP_RESOURCES;

  return (
    <Shell header={{ kind: 'sub', title: 'Help', back: 'history', right: <span /> }} footer="peer">
      {detected ? (
        <>
          <h1>{CRISIS_HANDOFF.title}</h1>
          <p className="lead">{CRISIS_HANDOFF.body}</p>
          <p className="small muted">{CRISIS_HANDOFF.notSaved}</p>
        </>
      ) : (
        <h1>{HELP_HEADING}</h1>
      )}

      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {resources.map((r) => (
          <li key={r.id}>
            <ResourceCard resource={r} />
          </li>
        ))}
      </ul>

      <Link to={signedIn ? '/home' : '/'} className="btn btn--ghost btn--block">Back to {signedIn ? 'Home' : 'start'}</Link>
    </Shell>
  );
}

function ResourceCard({ resource: r }: { resource: HelpResource }) {
  const emergency = r.tone === 'emergency';
  return (
    <section className={`card ${emergency ? 'card--danger' : 'card--soft'}`} aria-labelledby={`help-${r.id}`}>
      {r.label && <span className="card__label">{r.label}</span>}
      <h2 id={`help-${r.id}`} style={{ fontSize: '1.1rem', margin: 0 }}>{r.title}</h2>
      <p>{r.body}</p>
      <div className="row row--wrap">
        {r.actions.map((a, i) => (
          <a
            key={a.href}
            href={a.href}
            className={`btn btn--sm${emergency ? ' btn--danger' : i === 0 ? ' btn--primary' : ''}`}
            {...(a.external ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            {a.label}
          </a>
        ))}
      </div>
    </section>
  );
}
