import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APP_NAME } from '../lib/brand';
import { listenForStop } from '../lib/shareSignal';
import { watchSharedBrief } from '../lib/sharedBriefWatch';
import type { SharedBriefOutcome } from '../lib/sharesApi';
import { isLinkActive, useApp } from '../lib/store';
import type { BriefSnapshot } from '../lib/types';
import { DoctorBriefBody } from './Brief';

/**
 * D1 · Shared doctor view (expiring link, no login) and D2 · Link expired / revoked.
 * Read-only snapshot of the brief. The apricot bar marks it as a shared view.
 * Links made on this device are found in its storage. Any other link is looked up on the server
 * (GET /api/shared/:token, ADR-009), so the doctor can open it on their own device, and the open page
 * clears as soon as the patient stops sharing (live signal, with a 30-second re-check as backup).
 */
export function SharedBrief() {
  const { token } = useParams();
  const link = useApp((s) => (s.shareLinks ?? []).find((l) => l.token === token));
  const [remote, setRemote] = useState<SharedBriefOutcome | 'loading' | null>(null);

  // Server links: cleared the moment the patient stops sharing (live signal), with re-checks as a backup.
  useEffect(() => {
    if (link || !token) return;
    setRemote('loading');
    return watchSharedBrief(token, setRemote, { listen: (onSignal) => listenForStop(token, onSignal) });
  }, [link, token]);

  // Links made on this device: pick up "Stop sharing" from another tab, and hide the brief the moment it expires.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!link) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === 'get-heard') void useApp.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    const ms = new Date(link.expiresAt).getTime() - Date.now();
    const timer = ms > 0 && ms <= 2_147_000_000 ? setTimeout(() => setTick((n) => n + 1), ms + 500) : undefined;
    return () => {
      window.removeEventListener('storage', onStorage);
      clearTimeout(timer);
    };
  }, [link]);

  let shown: { brief: BriefSnapshot; expiresAt: string } | undefined;
  if (link) {
    if (isLinkActive(link)) shown = { brief: link.snapshot, expiresAt: link.expiresAt };
  } else if (remote === 'loading' || remote === null) {
    return <SharedStatus text="Opening the brief…" busy />;
  } else if (remote.status === 'ok') {
    shown = { brief: remote.brief, expiresAt: remote.expiresAt };
  } else if (remote.status === 'unavailable') {
    return <SharedStatus text="We couldn’t open this link right now. Check your connection and try again in a moment." />;
  }

  // D2: expired, revoked and unknown links all look the same, so nothing about the patient leaks — not even a name.
  if (!shown) {
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
        <span className="shared-bar__expires">{expiresIn(shown.expiresAt)}</span>
        <button className="btn shared-bar__print no-print" onClick={() => window.print()}>Print</button>
      </header>
      <main id="main" className="shared-main">
        <DoctorBriefBody data={shown.brief} showTimeline variant="shared" />
        <p className="small muted">Prepared by the patient using {APP_NAME}. Not a diagnosis. View only.</p>
      </main>
    </div>
  );
}

/** While a server link is opening, or if the server can't be reached. Same bar as the shared view. */
function SharedStatus({ text, busy = false }: { text: string; busy?: boolean }) {
  return (
    <div className="shared">
      <header className="shared-bar"><span className="shared-bar__brand">{APP_NAME}</span></header>
      <main id="main" className="shared-gone" aria-busy={busy}>
        <p className="muted">{text}</p>
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
