import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PublicLayout } from '../components/PublicLayout';
import { APP_NAME } from '../lib/brand';
import { watchSharedBrief } from '../lib/sharedBriefWatch';
import type { SharedBriefOutcome } from '../lib/sharesApi';
import { isLinkActive, useApp } from '../lib/store';
import type { BriefSnapshot } from '../lib/types';
import { DoctorBriefBody } from './Brief';

type Reason = 'missing' | 'revoked' | 'expired' | 'unavailable';

/**
 * Shared doctor view (link, no login). Read-only snapshot of the brief.
 * Links made on this device (demo / local mode) are found in its storage. Any other link is looked up on
 * the server (GET /api/shared/:token, ADR-009), so the doctor can open it on their own device.
 * Either way the open page keeps checking: when the patient stops sharing or the link expires, the brief
 * is replaced by "This link was turned off" / "has expired" without a refresh.
 */
export function SharedBrief() {
  const { token } = useParams();
  const link = useApp((s) => (s.shareLinks ?? []).find((l) => l.token === token));
  const [remote, setRemote] = useState<SharedBriefOutcome | 'loading' | null>(null);

  // Server links: re-checked while open, so "Stop sharing" or expiry takes effect without a refresh.
  useEffect(() => {
    if (link || !token) return;
    setRemote('loading');
    return watchSharedBrief(token, setRemote);
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
  let reason: Reason | undefined;
  if (link) {
    if (isLinkActive(link)) shown = { brief: link.snapshot, expiresAt: link.expiresAt };
    else reason = link.revokedAt ? 'revoked' : 'expired';
  } else if (remote === 'loading' || remote === null) {
    return (
      <PublicLayout header="minimal">
        <main id="main" className="pub-main pub-main--narrow" aria-busy="true">
          <span className="eyebrow">Shared brief</span>
          <p className="pub-lead">Opening the brief…</p>
        </main>
      </PublicLayout>
    );
  } else if (remote.status === 'ok') {
    shown = { brief: remote.brief, expiresAt: remote.expiresAt };
  } else {
    reason = remote.status === 'stopped' ? 'revoked' : remote.status;
  }

  if (!shown) {
    return (
      <PublicLayout header="minimal">
        <main id="main" className="pub-main pub-main--narrow">
          <span className="eyebrow">Shared brief</span>
          <h1>
            {reason === 'revoked'
              ? 'This link was turned off'
              : reason === 'expired'
                ? 'This link has expired'
                : reason === 'unavailable'
                  ? 'We couldn’t open this link right now'
                  : 'We can’t find this link'}
          </h1>
          <p className="pub-lead">
            {reason === 'missing'
              ? 'Check that the whole link was copied. Shared briefs can only be opened while the patient is sharing them.'
              : reason === 'unavailable'
                ? 'Check your connection and try again in a moment.'
                : 'The patient chose how long to share their brief, and that time is up or they stopped sharing. Ask them for a new link.'}
          </p>
          <p className="small muted">Nothing from this brief is kept once a link ends.</p>
        </main>
      </PublicLayout>
    );
  }

  const expires = new Date(shown.expiresAt);
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
        <DoctorBriefBody data={shown.brief} showTimeline />
        <p className="small muted">Prepared by the patient with {APP_NAME}. Patient-reported, not a diagnosis.</p>
      </main>
    </PublicLayout>
  );
}
