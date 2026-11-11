import { Link } from 'react-router-dom';
import { BriefArt, SummaryArt, TalkArt } from '../../components/Art';
import { PublicLayout } from '../../components/PublicLayout';

const STEPS = [
  {
    eyebrow: 'Step 1 · Before',
    title: 'Tell how you feel',
    body: 'Talk or type in your own words. See how a doctor would read it, and fix anything that’s wrong.',
    Art: TalkArt,
  },
  {
    eyebrow: 'Step 2 · At the visit',
    title: 'Show your brief',
    body: 'Your top 3 priorities in large type. Playbooks help if you get brushed off.',
    Art: BriefArt,
  },
  {
    eyebrow: 'Step 3 · After',
    title: 'Keep it moving',
    body: 'A summary, a 30-second check-in, and a reminder when the next step is due.',
    Art: SummaryArt,
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
          {STEPS.map(({ eyebrow, title, body, Art }) => (
            <article key={title} className="pcard">
              <div className="art" style={{ minHeight: 150, padding: 16 }}><Art /></div>
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
