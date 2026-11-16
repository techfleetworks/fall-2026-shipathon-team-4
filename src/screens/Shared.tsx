import { Link, useParams } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';
import { isLinkActive, useApp } from '../lib/store';
import { DoctorBriefBody } from './Brief';

/**
 * D1 · Shared doctor view (expiring link, no login) and D2 · Link expired / revoked.
 * Read-only snapshot of the brief. The apricot bar marks it as a shared view.
 * LOCAL-ONLY MVP: the link is resolved from this device's storage; a server
 * replaces this lookup when accounts arrive.
 */
export function SharedBrief() {
  const { token } = useParams();
  const link = useApp((s) => (s.shareLinks ?? []).find((l) => l.token === token));

  // D2: expired, revoked and unknown links all look the same, so nothing about the patient leaks — not even a name.
  if (!link || !isLinkActive(link)) {
    return (
      <div className="shared">
        <header className="shared-bar"><span className="shared-bar__brand">{APP_NAME}</span></header>
        <main id="main" className="shared-gone">
          <div className="shared-gone__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="56" height="56">
              <path d="M16 22v-6a8 8 0 0 1 16 0v6" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <rect x="11" y="22" width="26" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </div>
          <h1>This link is no longer active</h1>
          <p className="muted">
            It may have expired, or the patient stopped sharing it. Ask them to send a new link — they can re-share from {APP_NAME} in a few seconds.
          </p>
          <Link to="/" className="text-link" style={{ alignSelf: 'center' }}>What is {APP_NAME}?</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="shared">
      <header className="shared-bar">
        <span className="shared-bar__brand">{APP_NAME}</span>
        <span className="shared-bar__note">Shared by the patient · patient-reported</span>
        <span className="shared-bar__expires">{expiresIn(link.expiresAt)}</span>
        <button className="btn shared-bar__print no-print" onClick={() => window.print()}>Print</button>
      </header>
      <main id="main" className="shared-main">
        <DoctorBriefBody data={link.snapshot} showTimeline variant="shared" />
        <p className="small muted">Prepared by the patient using {APP_NAME}. Not a diagnosis. View only.</p>
      </main>
    </div>
  );
}

/** "Link expires in 6 days" / "in 5 hours" / "in under an hour". */
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Link expires in under an hour';
  if (hours < 24) return `Link expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `Link expires in ${days} day${days === 1 ? '' : 's'}`;
}
