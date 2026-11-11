import { useParams } from 'react-router-dom';
import { PublicLayout } from '../components/PublicLayout';
import { APP_NAME } from '../lib/brand';
import { isLinkActive, useApp } from '../lib/store';
import { DoctorBriefBody } from './Brief';

/**
 * Shared doctor view (link, no login). Read-only snapshot of the brief.
 * LOCAL-ONLY MVP: the link is resolved from this device's storage; a server
 * replaces this lookup when accounts arrive.
 */
export function SharedBrief() {
  const { token } = useParams();
  const link = useApp((s) => (s.shareLinks ?? []).find((l) => l.token === token));

  if (!link || !isLinkActive(link)) {
    const reason = !link ? 'missing' : link.revokedAt ? 'revoked' : 'expired';
    return (
      <PublicLayout header="minimal">
        <main id="main" className="pub-main pub-main--narrow">
          <span className="eyebrow">Shared brief</span>
          <h1>
            {reason === 'revoked' ? 'This link was turned off' : reason === 'expired' ? 'This link has expired' : 'We can’t find this link'}
          </h1>
          <p className="pub-lead">
            {reason === 'missing'
              ? 'Check that the whole link was copied. Shared briefs can only be opened while the patient is sharing them.'
              : 'The patient chose how long to share their brief, and that time is up or they stopped sharing. Ask them for a new link.'}
          </p>
          <p className="small muted">Nothing from this brief is kept once a link ends.</p>
        </main>
      </PublicLayout>
    );
  }

  const expires = new Date(link.expiresAt);
  return (
    <PublicLayout header="minimal" footer={false}>
      <main id="main" className="pub-main">
        <div className="pcard pcard--muted">
          <p className="small" style={{ margin: 0 }}>
            <strong>Shared by the patient, read-only.</strong> Link expires{' '}
            {expires.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at{' '}
            {expires.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.
          </p>
        </div>
        <DoctorBriefBody data={link.snapshot} showTimeline />
        <p className="small muted">Prepared by the patient with {APP_NAME}. Patient-reported, not a diagnosis.</p>
      </main>
    </PublicLayout>
  );
}
