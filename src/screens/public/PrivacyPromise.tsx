import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';

/**
 * P4 · Our privacy promise.
 * Commitments follow PRD §7 ("What we never do"). Exact wording still needs
 * team + counsel sign-off before launch.
 */
export function PrivacyPromise() {
  return (
    <PublicLayout>
      <main id="main" className="pub-main">
        <h1>Our privacy promise</h1>
        <p className="pub-sub">Your mental health is yours. Here’s exactly what we do and don’t do, in plain words.</p>

        <section className="cols-2">
          <div className="pcard pcard--active">
            <h2>We never sell your data</h2>
            <p>Not to advertisers, not to anyone.</p>
          </div>
          <div className="pcard">
            <h2>You choose who sees what</h2>
            <p>Share with a doctor or family member by link, and stop sharing anytime.</p>
          </div>
        </section>
        <section className="cols-3">
          <div className="pcard">
            <h2>Delete anytime</h2>
            <p>Delete your data or your whole account anytime in Settings.</p>
            <Link to="/legal/privacy" className="text-link pcard-foot">Read the full privacy policy</Link>
          </div>
          <div className="pcard">
            <h2>We only record if you both say yes</h2>
            <p>The app can record your visit to make a summary, but only if you and your doctor agree first. You can stop anytime.</p>
          </div>
          <div className="pcard">
            <h2>AI and data use</h2>
            <p>We never use your data to train AI models — and we configure our AI provider so they don’t either.</p>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
