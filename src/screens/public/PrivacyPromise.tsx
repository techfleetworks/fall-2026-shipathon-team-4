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
            <p>Not to advertisers, not to anyone. No ads, ever.</p>
          </div>
          <div className="pcard">
            <h2>You choose who sees what</h2>
            <p>Share with a doctor or family member by link, and stop sharing anytime.</p>
          </div>
        </section>
        <section className="cols-3">
          <div className="pcard">
            <h2>Delete anytime</h2>
            <p>Export everything or delete your account in Settings.</p>
          </div>
          <div className="pcard">
            <h2>Recording only with consent</h2>
            <p>Visit capture needs your OK and your doctor’s.</p>
          </div>
          <div className="pcard">
            <h2>AI and your data</h2>
            <p>We don’t use what you share to train AI models.</p>
          </div>
        </section>

        <Link to="/legal/privacy" className="text-link">Read the full privacy policy</Link>
      </main>
    </PublicLayout>
  );
}
