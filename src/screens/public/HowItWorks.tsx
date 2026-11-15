import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';

/** Small product previews for each step. Decorative: the step text says the same thing. */
function RecordingPreview() {
  const bars = [8, 14, 10, 20, 12, 6, 16, 22, 10, 14, 8, 18, 12, 16, 10, 6, 14, 10];
  return (
    <div className="mini">
      <span className="mini-label"><span className="mini-dot" />Recording · 0:14</span>
      <p className="mini-quote">“I keep waking around 4am and can’t get back to sleep.”</p>
      <div className="mini-wave">{bars.map((h, i) => <span key={i} style={{ height: h }} />)}</div>
    </div>
  );
}

function PrioritiesPreview() {
  return (
    <div className="mini">
      <span className="mini-label">Today’s priorities</span>
      <ol className="mini-list">
        {['Sleep — waking at 4am', 'New med side effects', 'Low energy, ~2 weeks'].map((t, i) => (
          <li key={t}><span className="mini-num">{i + 1}</span>{t}</li>
        ))}
      </ol>
    </div>
  );
}

function RecapPreview() {
  return (
    <div className="mini">
      <span className="mini-label">Visit recap</span>
      <ul className="mini-list">
        {['Start new med Thursday', 'Review in 2 weeks'].map((t) => (
          <li key={t}><span className="mini-check">✓</span>{t}</li>
        ))}
      </ul>
      <span className="mini-pill">30-second check-in</span>
    </div>
  );
}

const STEPS = [
  {
    eyebrow: 'Step 1 · Before the visit',
    title: 'Tell how you feel',
    body: 'Talk or type in your own words. See how a doctor would read it, and fix anything that’s wrong.',
    Preview: RecordingPreview,
  },
  {
    eyebrow: 'Step 2 · At the visit',
    title: 'Show your summary',
    body: 'Your top 3 priorities in large type. Playbooks help if you get brushed off.',
    Preview: PrioritiesPreview,
  },
  {
    eyebrow: 'Step 3 · After the visit',
    title: 'Follow-up',
    body: 'A recap, a 30-second check-in, and a reminder to take the next step.',
    Preview: RecapPreview,
  },
];

/** P2 · How it works — mirrors Before / At / After. */
export function HowItWorks() {
  return (
    <PublicLayout>
      <main id="main" className="pub-main">
        <h1>How it works</h1>
        <p className="pub-sub">Three steps around every appointment. You stay in control the whole time.</p>
        <section className="cols-3">
          {STEPS.map(({ eyebrow, title, body, Preview }) => (
            <article key={title} className="pcard">
              <div className="mini-frame" aria-hidden="true"><Preview /></div>
              <span className="eyebrow" style={{ marginTop: 6 }}>{eyebrow}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>
        <div className="btn-row">
          <Link to="/signup" className="btn btn--primary btn--lg">Try it free</Link>
          <span className="pub-sub" style={{ maxWidth: 300 }}>Takes about 2 minutes to see your first result.</span>
        </div>
      </main>
    </PublicLayout>
  );
}
